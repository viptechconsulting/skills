import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { prisma } from "@lynkro-outbound/db";
import { buildRealtimeSystemPrompt } from "@lynkro-outbound/shared";
import type { RealtimeSession } from "@lynkro-outbound/adapters";
import {
  getAdapterBundleForOrganization,
  executeAgentTool,
  transitionCall,
  scheduleNextAttemptIfNeeded,
} from "@lynkro-outbound/domain";
import { REALTIME_TOOL_DEFINITIONS } from "./toolDefinitions.js";
import { logger } from "../lib/logger.js";

const MAX_CALL_DURATION_MS = 20 * 60 * 1000; // 20 minutos, límite de seguridad de duración

interface TwilioMediaMessage {
  event: "connected" | "start" | "media" | "stop" | "mark";
  streamSid?: string;
  start?: { callSid: string; customParameters?: Record<string, string> };
  media?: { payload: string };
}

/**
 * Registra la ruta WebSocket que conecta el Media Stream bidireccional de
 * Twilio con la sesión de OpenAI Realtime. Cada conexión corresponde a
 * exactamente una llamada (`callId` en la URL). Responsable de: crear y
 * cerrar la sesión de IA, reenviar audio en ambas direcciones, manejar
 * interrupciones del prospecto (barge-in), despachar tool calls a través
 * del executor con guardrails, aplicar el límite de duración y liberar
 * todos los recursos (timers, sockets, sesión) en cualquier ruta de salida.
 */
export function registerTwilioMediaBridge(app: FastifyInstance): void {
  app.get("/ws/twilio-media/:callId", { websocket: true }, async (socket: WebSocket, request) => {
    const { callId } = request.params as { callId: string };

    let streamSid: string | null = null;
    let aiSession: RealtimeSession | null = null;
    let closed = false;
    let durationTimer: ReturnType<typeof setTimeout> | null = null;
    const transcriptBuffer: Array<{ speaker: "agent" | "prospect"; text: string; at: string }> = [];

    async function cleanup(reason: string): Promise<void> {
      if (closed) return;
      closed = true;
      if (durationTimer) clearTimeout(durationTimer);

      if (transcriptBuffer.length > 0) {
        await prisma.call.update({ where: { id: callId }, data: { transcript: transcriptBuffer as never } }).catch(() => undefined);
      }

      if (aiSession) {
        await aiSession.close().catch(() => undefined);
      }

      const call = await prisma.call.findUnique({ where: { id: callId } });
      if (call && !["completed", "failed", "canceled", "no_answer", "busy", "blocked"].includes(call.status)) {
        try {
          await transitionCall({
            organizationId: call.organizationId,
            callId: call.id,
            toStatus: "completed",
            causedBy: `bridge-cleanup:${reason}`,
          });
          if (!call.outcome) {
            await prisma.call.update({ where: { id: call.id }, data: { outcome: "FAILED" } });
          }
          await scheduleNextAttemptIfNeeded(call.organizationId, call.id);
        } catch (error) {
          logger.warn({ err: (error as Error).message, callId }, "bridge_cleanup_transition_failed");
        }
      }

      try {
        socket.close();
      } catch {
        // el socket puede ya estar cerrado
      }
    }

    try {
      const call = await prisma.call.findUnique({ where: { id: callId } });
      if (!call) {
        logger.warn({ callId }, "media_bridge_call_not_found");
        socket.close();
        return;
      }

      const [campaign, prospect, voiceAgent] = await Promise.all([
        prisma.campaign.findFirst({ where: { id: call.campaignId } }),
        prisma.prospect.findFirst({ where: { id: call.prospectId } }),
        prisma.campaign
          .findFirst({ where: { id: call.campaignId } })
          .then((c) => (c ? prisma.voiceAgent.findFirst({ where: { id: c.voiceAgentId } }) : null)),
      ]);
      if (!campaign || !prospect || !voiceAgent) {
        logger.error({ callId }, "media_bridge_missing_context");
        socket.close();
        return;
      }

      const adapters = await getAdapterBundleForOrganization(call.organizationId, call.simulation);

      const humanHandoffAvailable = Boolean(campaign.transferToPhoneNumber);
      const systemPrompt = buildRealtimeSystemPrompt({
        agentName: voiceAgent.name,
        companyName: "Lynkro",
        prospectName: prospect.name,
        language: prospect.language,
        prospectContext: prospect.context,
        callIntent: prospect.intent,
        callObjective: campaign.objective,
        desiredOutcome: prospect.desiredOutcome,
        authorizedOfferInfo: campaign.objective,
        agentInstructions: campaign.agentInstructions,
        qualificationQuestions: Array.isArray(campaign.qualificationQuestions)
          ? (campaign.qualificationQuestions as Array<{ prompt: string }>).map((q) => q.prompt)
          : [],
        bookingConditions: campaign.bookingConditions,
        transferConditions: campaign.transferConditions,
        voicemailMessage: campaign.voicemailMessage,
        humanHandoffAvailable,
      });

      aiSession = adapters.ai.createRealtimeSession({
        callId,
        systemPrompt,
        voice: voiceAgent.voice,
        language: prospect.language,
        tools: REALTIME_TOOL_DEFINITIONS,
        inputAudioFormat: "g711_ulaw",
        outputAudioFormat: "g711_ulaw",
      });

      await aiSession.start({
        onAudioChunk: (base64Audio) => {
          if (!streamSid || closed) return;
          socket.send(
            JSON.stringify({ event: "media", streamSid, media: { payload: base64Audio } }),
          );
        },
        onTranscriptDelta: (speaker, text) => {
          transcriptBuffer.push({ speaker, text, at: new Date().toISOString() });
        },
        onSpeechStartedByProspect: () => {
          // Interrupción: cancela la respuesta en curso del modelo y limpia
          // el buffer de audio ya enviado a Twilio para que deje de sonar
          // inmediatamente (barge-in real, no solo del lado del modelo).
          aiSession?.cancelCurrentResponse();
          if (streamSid) {
            socket.send(JSON.stringify({ event: "clear", streamSid }));
          }
        },
        onToolCall: async (toolCall) => {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(toolCall.argumentsJson) as Record<string, unknown>;
          } catch {
            args = {};
          }
          const outcome = await executeAgentTool(
            { organizationId: call.organizationId, callId, adapters },
            toolCall.name,
            { ...args, callId },
          );
          aiSession?.submitToolResult(toolCall.toolCallId, outcome);

          if (toolCall.name === "end_call") {
            void cleanup("end_call_tool");
          }
        },
        onError: (error) => {
          logger.error({ err: error.message, callId }, "realtime_session_error");
          void cleanup("ai_session_error");
        },
        onClose: () => {
          void cleanup("ai_session_closed");
        },
      });

      durationTimer = setTimeout(() => {
        void cleanup("max_duration_reached");
      }, MAX_CALL_DURATION_MS);

      socket.on("message", (raw: Buffer) => {
        let message: TwilioMediaMessage;
        try {
          message = JSON.parse(raw.toString());
        } catch {
          return;
        }

        if (message.event === "start" && message.start) {
          streamSid = message.streamSid ?? null;
        } else if (message.event === "media" && message.media) {
          aiSession?.sendAudioChunk(message.media.payload);
        } else if (message.event === "stop") {
          void cleanup("twilio_stream_stopped");
        }
      });

      socket.on("close", () => {
        void cleanup("socket_closed");
      });

      socket.on("error", (error: Error) => {
        logger.error({ err: error.message, callId }, "twilio_media_socket_error");
        void cleanup("socket_error");
      });
    } catch (error) {
      logger.error({ err: (error as Error).message, callId }, "media_bridge_setup_failed");
      await cleanup("setup_failed");
    }
  });
}
