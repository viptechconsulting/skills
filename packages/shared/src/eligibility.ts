import { isE164 } from "./phone.js";
import { isWithinAllowedWindow, type AllowedWindow } from "./schedule.js";
import { isTerminalCallStatus } from "./callStateMachine.js";
import type { CallStatus, CampaignStatus } from "./enums.js";

/**
 * Razones de rechazo de elegibilidad, en el orden en que se evalúan.
 * El motor devuelve la PRIMERA razón encontrada (fail-fast) para que el
 * mensaje sea siempre determinístico y accionable.
 */
export const ELIGIBILITY_REJECTION_REASONS = [
  "INVALID_PHONE_NUMBER",
  "CONSENT_REQUIRED_NOT_GIVEN",
  "DO_NOT_CALL_LISTED",
  "CAMPAIGN_NOT_ACTIVE",
  "OUTSIDE_ALLOWED_WINDOW",
  "MAX_ATTEMPTS_REACHED",
  "ACTIVE_CALL_IN_PROGRESS",
  "FUTURE_APPOINTMENT_EXISTS",
  "PROSPECT_BLOCKED",
] as const;
export type EligibilityRejectionReason = (typeof ELIGIBILITY_REJECTION_REASONS)[number];

export interface EligibilityInput {
  phoneE164: string;
  consentRequired: boolean;
  consentGiven: boolean;
  isOnDoNotCallList: boolean;
  isProspectBlocked: boolean;
  campaignStatus: CampaignStatus;
  prospectTimezone: string;
  allowedWindow: AllowedWindow;
  attemptCount: number;
  maxAttempts: number;
  /** Estados de otras llamadas activas (no terminales) del mismo prospecto. */
  activeCallStatuses: CallStatus[];
  hasFutureActiveAppointment: boolean;
  /** Instante (UTC) contra el cual evaluar la ventana horaria. Por defecto: ahora. */
  evaluateAt?: Date;
}

export interface EligibilityResult {
  eligible: boolean;
  reason?: EligibilityRejectionReason;
  /** Instante evaluado, útil para logs/auditoría. */
  evaluatedAt: Date;
}

/**
 * Función pura y determinística. NO realiza I/O de red y NUNCA delega estas
 * decisiones al modelo de IA. Debe ejecutarse en el backend inmediatamente
 * antes de encolar cualquier llamada (worker) y también antes de aceptar una
 * acción manual "llamar ahora" desde el panel.
 */
export function evaluateCallEligibility(input: EligibilityInput): EligibilityResult {
  const evaluatedAt = input.evaluateAt ?? new Date();

  if (!isE164(input.phoneE164)) {
    return { eligible: false, reason: "INVALID_PHONE_NUMBER", evaluatedAt };
  }

  if (input.isProspectBlocked) {
    return { eligible: false, reason: "PROSPECT_BLOCKED", evaluatedAt };
  }

  if (input.isOnDoNotCallList) {
    return { eligible: false, reason: "DO_NOT_CALL_LISTED", evaluatedAt };
  }

  if (input.consentRequired && !input.consentGiven) {
    return { eligible: false, reason: "CONSENT_REQUIRED_NOT_GIVEN", evaluatedAt };
  }

  if (input.campaignStatus !== "active") {
    return { eligible: false, reason: "CAMPAIGN_NOT_ACTIVE", evaluatedAt };
  }

  const hasActiveNonTerminalCall = input.activeCallStatuses.some(
    (status) => !isTerminalCallStatus(status),
  );
  if (hasActiveNonTerminalCall) {
    return { eligible: false, reason: "ACTIVE_CALL_IN_PROGRESS", evaluatedAt };
  }

  if (input.hasFutureActiveAppointment) {
    return { eligible: false, reason: "FUTURE_APPOINTMENT_EXISTS", evaluatedAt };
  }

  if (input.attemptCount >= input.maxAttempts) {
    return { eligible: false, reason: "MAX_ATTEMPTS_REACHED", evaluatedAt };
  }

  const withinWindow = isWithinAllowedWindow(evaluatedAt, input.prospectTimezone, input.allowedWindow);
  if (!withinWindow) {
    return { eligible: false, reason: "OUTSIDE_ALLOWED_WINDOW", evaluatedAt };
  }

  return { eligible: true, evaluatedAt };
}

export const ELIGIBILITY_REJECTION_MESSAGES: Record<EligibilityRejectionReason, string> = {
  INVALID_PHONE_NUMBER: "El número de teléfono no está en formato E.164 válido.",
  CONSENT_REQUIRED_NOT_GIVEN: "El prospecto no tiene consentimiento registrado.",
  DO_NOT_CALL_LISTED: "El número está en la lista Do Not Call de la organización.",
  CAMPAIGN_NOT_ACTIVE: "La campaña no está activa (pausada, en borrador o archivada).",
  OUTSIDE_ALLOWED_WINDOW: "La hora local del prospecto está fuera de la ventana permitida.",
  MAX_ATTEMPTS_REACHED: "Se alcanzó el número máximo de intentos configurado.",
  ACTIVE_CALL_IN_PROGRESS: "Ya existe una llamada activa (no terminal) para este prospecto.",
  FUTURE_APPOINTMENT_EXISTS: "El prospecto ya tiene una cita futura activa.",
  PROSPECT_BLOCKED: "El prospecto está bloqueado para futuras comunicaciones.",
};
