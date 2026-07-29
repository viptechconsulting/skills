import { DateTime } from "luxon";
import { nextInstantWithinWindow, type AllowedWindow } from "./schedule.js";
import { NON_RETRYABLE_OUTCOMES, type CallOutcome, type RetryReason } from "./enums.js";

export interface RetryPolicyConfig {
  reason: RetryReason;
  maxAttempts: number;
  intervalMinutes: number;
  /**
   * Cuando es true, alterna el bloque horario del intento (mañana/tarde)
   * respecto al intento anterior para no repetir siempre la misma hora,
   * dentro de lo permitido por la ventana de la campaña.
   */
  spreadAcrossDayparts: boolean;
}

export interface ComputeNextAttemptInput {
  outcome: CallOutcome;
  attemptCount: number;
  campaignMaxAttempts: number;
  policy: RetryPolicyConfig;
  lastAttemptAtUtc: Date;
  prospectTimezone: string;
  allowedWindow: AllowedWindow;
}

export interface ComputeNextAttemptResult {
  shouldRetry: boolean;
  nextAttemptAtUtc?: Date;
  stopReason?:
    | "NON_RETRYABLE_OUTCOME"
    | "CAMPAIGN_MAX_ATTEMPTS_REACHED"
    | "POLICY_MAX_ATTEMPTS_REACHED";
}

const RETRYABLE_OUTCOME_BY_REASON: Record<RetryReason, CallOutcome[]> = {
  no_answer: ["NO_ANSWER"],
  busy: ["BUSY"],
  voicemail: ["VOICEMAIL"],
  technical_failure: ["FAILED"],
};

/**
 * Calcula si corresponde un próximo intento y cuándo, respetando siempre la
 * zona horaria local del prospecto y el máximo global de la campaña. Se
 * detiene ante cualquier resultado no reintentable (conversación resuelta,
 * cita, rechazo, DNC, número equivocado) o al alcanzar el límite.
 */
export function computeNextAttempt(input: ComputeNextAttemptInput): ComputeNextAttemptResult {
  if (NON_RETRYABLE_OUTCOMES.includes(input.outcome)) {
    return { shouldRetry: false, stopReason: "NON_RETRYABLE_OUTCOME" };
  }

  const expectedOutcomes = RETRYABLE_OUTCOME_BY_REASON[input.policy.reason];
  if (!expectedOutcomes.includes(input.outcome)) {
    return { shouldRetry: false, stopReason: "NON_RETRYABLE_OUTCOME" };
  }

  if (input.attemptCount >= input.campaignMaxAttempts) {
    return { shouldRetry: false, stopReason: "CAMPAIGN_MAX_ATTEMPTS_REACHED" };
  }

  if (input.attemptCount >= input.policy.maxAttempts) {
    return { shouldRetry: false, stopReason: "POLICY_MAX_ATTEMPTS_REACHED" };
  }

  let candidate = DateTime.fromJSDate(input.lastAttemptAtUtc, { zone: "utc" }).plus({
    minutes: input.policy.intervalMinutes,
  });

  if (input.policy.spreadAcrossDayparts) {
    const local = candidate.setZone(input.prospectTimezone);
    const previousLocal = DateTime.fromJSDate(input.lastAttemptAtUtc, {
      zone: input.prospectTimezone,
    });
    const wasMorning = previousLocal.hour < 13;
    // Si el intento anterior fue en la mañana, empujar el candidato a la
    // tarde del mismo día (dentro de la ventana permitida), y viceversa.
    const targetHour = wasMorning ? 15 : 10;
    candidate = local.set({ hour: targetHour, minute: 0, second: 0, millisecond: 0 }).toUTC();
  }

  const nextAttemptAtUtc = nextInstantWithinWindow(
    candidate.toJSDate(),
    input.prospectTimezone,
    input.allowedWindow,
  );

  return { shouldRetry: true, nextAttemptAtUtc };
}
