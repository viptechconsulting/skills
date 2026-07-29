import { prisma } from "@lynkro-outbound/db";
import { computeNextAttempt, type CallOutcome, type RetryReason } from "@lynkro-outbound/shared";
import { logger } from "./logger.js";

const OUTCOME_TO_RETRY_REASON: Partial<Record<CallOutcome, RetryReason>> = {
  NO_ANSWER: "no_answer",
  BUSY: "busy",
  VOICEMAIL: "voicemail",
  FAILED: "technical_failure",
};

/**
 * Se ejecuta después de que una llamada termina. Decide si corresponde un
 * reintento según la RetryPolicy configurada para la campaña y el
 * resultado obtenido, y en caso afirmativo actualiza el prospecto con su
 * próximo intento. Nunca reintenta ante resultados no reintentables
 * (conversación resuelta, cita, rechazo, DNC, número equivocado) ni por
 * encima del máximo de la campaña.
 */
const STATUSES_NEVER_OVERWRITTEN_BY_RETRY_LOGIC = new Set(["do_not_call", "blocked"]);

export async function scheduleNextAttemptIfNeeded(organizationId: string, callId: string): Promise<void> {
  const call = await prisma.call.findFirst({ where: { id: callId, organizationId } });
  if (!call || !call.outcome) return;

  const [campaign, prospect] = await Promise.all([
    prisma.campaign.findFirst({ where: { id: call.campaignId, organizationId }, include: { retryPolicies: true } }),
    prisma.prospect.findFirst({ where: { id: call.prospectId, organizationId } }),
  ]);
  if (!campaign || !prospect) return;

  const lastAttemptAt = call.endedAt ?? new Date();
  const nextAttemptCount = prospect.attemptCount + 1;

  // Un resultado ya definitivo (ej. DO_NOT_CALL vía mark_do_not_call, o
  // bloqueado manualmente) no debe ser sobrescrito por esta lógica; solo se
  // actualiza el contador de intentos para mantener la analítica correcta.
  if (STATUSES_NEVER_OVERWRITTEN_BY_RETRY_LOGIC.has(prospect.status)) {
    await prisma.prospect.update({
      where: { id: prospect.id },
      data: { attemptCount: nextAttemptCount, lastAttemptAt },
    });
    return;
  }

  const reason = OUTCOME_TO_RETRY_REASON[call.outcome];
  const policy = reason ? campaign.retryPolicies.find((p) => p.reason === reason) : undefined;

  const result = reason && policy
    ? computeNextAttempt({
        outcome: call.outcome,
        attemptCount: nextAttemptCount,
        campaignMaxAttempts: campaign.maxAttempts,
        policy: {
          reason: policy.reason,
          maxAttempts: policy.maxAttempts,
          intervalMinutes: policy.intervalMinutes,
          spreadAcrossDayparts: policy.spreadAcrossDayparts,
        },
        lastAttemptAtUtc: lastAttemptAt,
        prospectTimezone: prospect.timezone,
        allowedWindow: { start: campaign.allowedWindowStart, end: campaign.allowedWindowEnd },
      })
    : { shouldRetry: false as const, stopReason: "NON_RETRYABLE_OUTCOME" as const };

  if (!result.shouldRetry || !result.nextAttemptAtUtc) {
    logger.info({ callId, reason: result.stopReason }, "retry_not_scheduled");
    await prisma.prospect.update({
      where: { id: prospect.id },
      data: { attemptCount: nextAttemptCount, lastAttemptAt, nextAttemptAt: null, status: "completed" },
    });
    return;
  }

  await prisma.prospect.update({
    where: { id: prospect.id },
    data: {
      attemptCount: nextAttemptCount,
      lastAttemptAt,
      nextAttemptAt: result.nextAttemptAtUtc,
      status: "scheduled",
    },
  });
}
