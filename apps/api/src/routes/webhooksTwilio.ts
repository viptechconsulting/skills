import type { FastifyInstance, FastifyRequest } from "fastify";
import { prisma, recordCallEventIdempotent } from "@lynkro-outbound/db";
import {
  buildIdempotencyKey,
  twilioAmdCallbackSchema,
  twilioRecordingCallbackSchema,
  twilioVoiceStatusCallbackSchema,
  type CallOutcome,
  type CallStatus,
} from "@lynkro-outbound/shared";
import { getAdapterBundleForOrganization } from "@lynkro-outbound/domain";
import { transitionCall } from "@lynkro-outbound/domain";
import { scheduleNextAttemptIfNeeded } from "@lynkro-outbound/domain";
import { env } from "../config.js";
import { logger } from "../lib/logger.js";

const TWILIO_STATUS_TO_CALL_STATUS: Record<string, CallStatus> = {
  queued: "queued",
  initiated: "initiated",
  ringing: "ringing",
  // El estado "in-progress" de Twilio significa que la llamada fue
  // contestada (por una persona o un contestador); nuestro estado interno
  // "in_progress" es distinto: se reserva para cuando la conversación con
  // un humano ya está en curso (después de human_detected). Por eso este
  // evento mapea a "answered", y es el webhook de AMD el que decide si se
  // avanza a human_detected o voicemail_detected.
  "in-progress": "answered",
  completed: "completed",
  busy: "busy",
  failed: "failed",
  "no-answer": "no_answer",
  canceled: "canceled",
};

const TWILIO_STATUS_TO_OUTCOME: Partial<Record<string, CallOutcome>> = {
  busy: "BUSY",
  failed: "FAILED",
  "no-answer": "NO_ANSWER",
};

function fullWebhookUrl(request: FastifyRequest): string {
  return `${env.TWILIO_WEBHOOK_BASE_URL}${request.url}`;
}

async function verifySignatureOrReject(
  request: FastifyRequest,
  organizationId: string,
  simulationMode: boolean,
): Promise<boolean> {
  const bundle = await getAdapterBundleForOrganization(organizationId, simulationMode);
  const signatureHeader = request.headers["x-twilio-signature"] as string | undefined;
  return bundle.telephony.verifyWebhookSignature({
    url: fullWebhookUrl(request),
    signatureHeader,
    params: request.body as Record<string, string>,
  });
}

export async function twilioWebhookRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_req, body, done) => {
      try {
        done(null, Object.fromEntries(new URLSearchParams(body as string)));
      } catch (error) {
        done(error as Error, undefined);
      }
    },
  );

  fastify.post("/webhooks/twilio/voice-status", async (request, reply) => {
    const parsed = twilioVoiceStatusCallbackSchema.safeParse(request.body);
    if (!parsed.success) {
      logger.warn({ issues: parsed.error.issues }, "invalid_twilio_voice_status_payload");
      return reply.code(400).send({ error: "INVALID_PAYLOAD" });
    }

    const call = await prisma.call.findFirst({ where: { providerCallSid: parsed.data.CallSid } });
    if (!call) {
      // Puede ser una llamada de otra instalación o un evento fuera de orden; se ignora sin error 500.
      return reply.code(202).send({ ok: true, ignored: true });
    }

    const validSignature = await verifySignatureOrReject(request, call.organizationId, call.simulation);
    if (!validSignature) {
      logger.warn({ callSid: parsed.data.CallSid }, "invalid_twilio_signature");
      return reply.code(403).send({ error: "INVALID_SIGNATURE" });
    }

    const idempotencyKey = buildIdempotencyKey(
      parsed.data.CallSid,
      parsed.data.CallStatus,
      parsed.data.SequenceNumber,
    );

    const { created } = await recordCallEventIdempotent(prisma, {
      callId: call.id,
      type: `twilio.voice-status.${parsed.data.CallStatus}`,
      payload: parsed.data as never,
      causedBy: "twilio-webhook",
      idempotencyKey,
    });

    if (!created) {
      return reply.send({ ok: true, duplicate: true });
    }

    const nextStatus = TWILIO_STATUS_TO_CALL_STATUS[parsed.data.CallStatus];
    if (nextStatus && nextStatus !== call.status) {
      try {
        await transitionCall({
          organizationId: call.organizationId,
          callId: call.id,
          toStatus: nextStatus,
          causedBy: "twilio-webhook",
          payload: { callStatus: parsed.data.CallStatus },
        });
      } catch (error) {
        logger.warn({ err: (error as Error).message, callId: call.id }, "ignored_invalid_transition_from_webhook");
      }
    }

    const outcomeForStatus = TWILIO_STATUS_TO_OUTCOME[parsed.data.CallStatus];
    if (outcomeForStatus) {
      await prisma.call.update({
        where: { id: call.id },
        data: {
          outcome: outcomeForStatus,
          durationSeconds: parsed.data.CallDuration ? Number(parsed.data.CallDuration) : undefined,
        },
      });
      await scheduleNextAttemptIfNeeded(call.organizationId, call.id);
    }

    return reply.send({ ok: true });
  });

  fastify.post("/webhooks/twilio/amd", async (request, reply) => {
    const parsed = twilioAmdCallbackSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "INVALID_PAYLOAD" });
    }

    const call = await prisma.call.findFirst({ where: { providerCallSid: parsed.data.CallSid } });
    if (!call) {
      return reply.code(202).send({ ok: true, ignored: true });
    }

    const validSignature = await verifySignatureOrReject(request, call.organizationId, call.simulation);
    if (!validSignature) {
      return reply.code(403).send({ error: "INVALID_SIGNATURE" });
    }

    const idempotencyKey = buildIdempotencyKey(parsed.data.CallSid, "amd", parsed.data.AnsweredBy);
    const { created } = await recordCallEventIdempotent(prisma, {
      callId: call.id,
      type: `twilio.amd.${parsed.data.AnsweredBy}`,
      payload: parsed.data as never,
      causedBy: "twilio-webhook",
      idempotencyKey,
    });
    if (!created) return reply.send({ ok: true, duplicate: true });

    const isMachine = parsed.data.AnsweredBy.startsWith("machine");

    try {
      await transitionCall({
        organizationId: call.organizationId,
        callId: call.id,
        toStatus: isMachine ? "voicemail_detected" : "human_detected",
        causedBy: "twilio-amd-webhook",
      });
    } catch (error) {
      logger.warn({ err: (error as Error).message, callId: call.id }, "ignored_invalid_amd_transition");
    }

    if (isMachine) {
      // Nota de implementación: en un despliegue real, el puente de audio
      // (apps/api WS bridge) es responsable de reproducir el mensaje de
      // buzón configurado en la campaña ANTES de colgar. Aquí se marca el
      // resultado y se programa el siguiente paso; el hangup real ocurre
      // vía el bridge o, si la campaña no usa bridge de voz aún, aquí mismo.
      await prisma.call.update({ where: { id: call.id }, data: { outcome: "VOICEMAIL" } });
    }

    return reply.send({ ok: true });
  });

  fastify.post("/webhooks/twilio/recording", async (request, reply) => {
    const parsed = twilioRecordingCallbackSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "INVALID_PAYLOAD" });
    }

    const call = await prisma.call.findFirst({ where: { providerCallSid: parsed.data.CallSid } });
    if (!call) {
      return reply.code(202).send({ ok: true, ignored: true });
    }

    const validSignature = await verifySignatureOrReject(request, call.organizationId, call.simulation);
    if (!validSignature) {
      return reply.code(403).send({ error: "INVALID_SIGNATURE" });
    }

    const campaign = await prisma.campaign.findFirst({ where: { id: call.campaignId } });
    if (!campaign?.recordingEnabled) {
      // La grabación no está habilitada explícitamente para esta campaña;
      // se descarta la URL para no almacenar datos no autorizados.
      return reply.send({ ok: true, stored: false });
    }

    const idempotencyKey = buildIdempotencyKey(parsed.data.CallSid, "recording", parsed.data.RecordingSid);
    const { created } = await recordCallEventIdempotent(prisma, {
      callId: call.id,
      type: "twilio.recording",
      payload: parsed.data as never,
      causedBy: "twilio-webhook",
      idempotencyKey,
    });
    if (!created) return reply.send({ ok: true, duplicate: true });

    if (parsed.data.RecordingStatus === "completed") {
      await prisma.call.update({ where: { id: call.id }, data: { recordingUrl: parsed.data.RecordingUrl } });
    }

    return reply.send({ ok: true, stored: true });
  });

  fastify.post("/webhooks/twilio/voice-answer/:callId", async (request, reply) => {
    const { callId } = request.params as { callId: string };
    const call = await prisma.call.findUnique({ where: { id: callId } });
    if (!call) {
      return reply.code(404).send({ error: "CALL_NOT_FOUND" });
    }

    const validSignature = await verifySignatureOrReject(request, call.organizationId, call.simulation);
    if (!validSignature) {
      return reply.code(403).send({ error: "INVALID_SIGNATURE" });
    }

    const adapters = await getAdapterBundleForOrganization(call.organizationId, call.simulation);
    const wsBaseUrl = env.TWILIO_WEBHOOK_BASE_URL.replace(/^http/, "ws");
    const twiml = adapters.telephony.buildMediaStreamTwiml({
      mediaStreamWebSocketUrl: `${wsBaseUrl}/ws/twilio-media/${callId}`,
      callId,
    });

    reply.header("Content-Type", "text/xml");
    return reply.send(twiml);
  });
}
