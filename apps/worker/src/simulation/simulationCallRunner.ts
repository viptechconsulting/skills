import { prisma, type Call, type Campaign, type Prospect } from "@lynkro-outbound/db";
import { buildRealtimeSystemPrompt } from "@lynkro-outbound/shared";
import type { AdapterBundle } from "@lynkro-outbound/adapters";
import { transitionCall, executeAgentTool, scheduleNextAttemptIfNeeded } from "@lynkro-outbound/domain";
import { logger } from "../lib/logger.js";

const SIMULATION_TOOL_DEFINITIONS = [
  { name: "add_call_note", description: "", parameters: { type: "object", properties: {} } },
  { name: "end_call", description: "", parameters: { type: "object", properties: {} } },
];

/**
 * Ejecuta una llamada completa en modo simulación: avanza la máquina de
 * estados como lo haría una llamada real contestada por una persona, y
 * conduce la sesión de IA simulada (sin audio real) hasta que el guion
 * ejecute end_call. Permite probar todo el flujo de negocio — estados,
 * herramientas, resultado estructurado, reintentos — sin marcar teléfonos
 * reales ni depender de Twilio/OpenAI.
 */
export async function runSimulatedCall(input: {
  call: Call;
  campaign: Campaign;
  prospect: Prospect;
  adapters: AdapterBundle;
}): Promise<void> {
  const { call, campaign, prospect, adapters } = input;

  const voiceAgent = await prisma.voiceAgent.findUnique({ where: { id: campaign.voiceAgentId } });

  for (const status of ["initiated", "ringing", "answered", "human_detected", "in_progress"] as const) {
    await transitionCall({ organizationId: call.organizationId, callId: call.id, toStatus: status, causedBy: "simulation-runner" });
  }

  const systemPrompt = buildRealtimeSystemPrompt({
    agentName: voiceAgent?.name ?? "Agente Lynkro",
    agentPersona: voiceAgent?.persona ?? "Asistente de ventas profesional y cordial.",
    agentTone: voiceAgent?.tone ?? "",
    companyName: "Lynkro",
    prospectName: prospect.name,
    language: prospect.language,
    prospectContext: prospect.context,
    callIntent: prospect.intent,
    callObjective: campaign.objective,
    desiredOutcome: prospect.desiredOutcome,
    authorizedOfferInfo: campaign.objective,
    agentInstructions: campaign.agentInstructions,
    qualificationQuestions: [],
    bookingConditions: campaign.bookingConditions,
    transferConditions: campaign.transferConditions,
    voicemailMessage: campaign.voicemailMessage,
    humanHandoffAvailable: Boolean(campaign.transferToPhoneNumber),
  });

  const session = adapters.ai.createRealtimeSession({
    callId: call.id,
    systemPrompt,
    voice: voiceAgent?.voice ?? "alloy",
    language: prospect.language,
    tools: SIMULATION_TOOL_DEFINITIONS,
    inputAudioFormat: "pcm16",
    outputAudioFormat: "pcm16",
  });

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    session
      .start({
        onAudioChunk: () => undefined,
        onTranscriptDelta: () => undefined,
        onSpeechStartedByProspect: () => undefined,
        onToolCall: async (toolCall) => {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(toolCall.argumentsJson) as Record<string, unknown>;
          } catch {
            args = {};
          }
          await executeAgentTool(
            { organizationId: call.organizationId, callId: call.id, adapters },
            toolCall.name,
            { ...args, callId: call.id },
          );
        },
        onError: (error) => {
          logger.error({ err: error.message, callId: call.id }, "simulation_session_error");
          finish();
        },
        onClose: () => finish(),
      })
      .catch((error) => {
        logger.error({ err: (error as Error).message, callId: call.id }, "simulation_session_start_failed");
        finish();
      });
  });

  await session.close();

  const finalCall = await prisma.call.findUniqueOrThrow({ where: { id: call.id } });
  if (!finalCall.outcome) {
    await prisma.call.update({ where: { id: call.id }, data: { outcome: "FAILED" } });
  }
  if (finalCall.status !== "completed") {
    await transitionCall({ organizationId: call.organizationId, callId: call.id, toStatus: "completed", causedBy: "simulation-runner" }).catch(
      () => undefined,
    );
  }

  await scheduleNextAttemptIfNeeded(call.organizationId, call.id);
}
