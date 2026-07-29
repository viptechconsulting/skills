import { CALL_STATUSES, TERMINAL_CALL_STATUSES, type CallStatus } from "./enums.js";

/**
 * Tabla explícita de transiciones permitidas. Cualquier transición que no
 * esté aquí se considera inválida y debe rechazarse (ver assertValidTransition).
 */
const ALLOWED_TRANSITIONS: Record<CallStatus, CallStatus[]> = {
  draft: ["scheduled", "queued", "canceled"],
  scheduled: ["queued", "canceled", "blocked"],
  queued: ["dialing", "eligibility_failed", "canceled", "blocked"],
  eligibility_failed: [],
  dialing: ["initiated", "failed", "canceled"],
  initiated: ["ringing", "failed", "canceled"],
  ringing: ["answered", "no_answer", "busy", "failed", "canceled"],
  answered: ["human_detected", "voicemail_detected", "failed"],
  human_detected: ["in_progress", "transferring", "failed"],
  voicemail_detected: ["completed", "failed"],
  in_progress: ["transferring", "completed", "failed"],
  transferring: ["completed", "failed"],
  completed: [],
  no_answer: [],
  busy: [],
  failed: [],
  canceled: [],
  blocked: [],
};

export function isTerminalCallStatus(status: CallStatus): boolean {
  return TERMINAL_CALL_STATUSES.includes(status);
}

export function getAllowedNextStatuses(current: CallStatus): CallStatus[] {
  return ALLOWED_TRANSITIONS[current] ?? [];
}

export function canTransition(from: CallStatus, to: CallStatus): boolean {
  if (from === to) return false;
  return getAllowedNextStatuses(from).includes(to);
}

export class InvalidCallTransitionError extends Error {
  constructor(
    public readonly from: CallStatus,
    public readonly to: CallStatus,
  ) {
    super(`Transición de llamada inválida: ${from} -> ${to}`);
    this.name = "InvalidCallTransitionError";
  }
}

/** Lanza InvalidCallTransitionError si la transición no está permitida. */
export function assertValidTransition(from: CallStatus, to: CallStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidCallTransitionError(from, to);
  }
}

export function isKnownCallStatus(value: string): value is CallStatus {
  return (CALL_STATUSES as readonly string[]).includes(value);
}
