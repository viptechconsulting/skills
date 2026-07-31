/**
 * Enumeraciones de dominio compartidas entre api, worker y web.
 * Deben coincidir exactamente con los enums definidos en packages/db/prisma/schema.prisma.
 */

export const USER_ROLES = ["owner", "admin", "agent"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const CAMPAIGN_STATUSES = ["draft", "active", "paused", "archived"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const PROSPECT_STATUSES = [
  "new",
  "scheduled",
  "queued",
  "in_progress",
  "completed",
  "blocked",
  "do_not_call",
] as const;
export type ProspectStatus = (typeof PROSPECT_STATUSES)[number];

/**
 * Máquina de estados de la llamada. El orden importa solo para lectura;
 * las transiciones válidas están definidas explícitamente en callStateMachine.ts.
 */
export const CALL_STATUSES = [
  "draft",
  "scheduled",
  "queued",
  "eligibility_failed",
  "dialing",
  "initiated",
  "ringing",
  "answered",
  "human_detected",
  "voicemail_detected",
  "in_progress",
  "transferring",
  "completed",
  "no_answer",
  "busy",
  "failed",
  "canceled",
  "blocked",
] as const;
export type CallStatus = (typeof CALL_STATUSES)[number];

export const TERMINAL_CALL_STATUSES: CallStatus[] = [
  "eligibility_failed",
  "completed",
  "no_answer",
  "busy",
  "failed",
  "canceled",
  "blocked",
];

/** Resultado estructurado obligatorio al finalizar una llamada. */
export const CALL_OUTCOMES = [
  "BOOKED",
  "QUALIFIED_NOT_BOOKED",
  "CALLBACK_REQUESTED",
  "TRANSFERRED",
  "NOT_INTERESTED",
  "DO_NOT_CALL",
  "WRONG_NUMBER",
  "VOICEMAIL",
  "NO_ANSWER",
  "BUSY",
  "FAILED",
] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

/** Motivos de reintento configurables por campaña. */
export const RETRY_REASONS = ["no_answer", "busy", "voicemail", "technical_failure"] as const;
export type RetryReason = (typeof RETRY_REASONS)[number];

/** Outcomes que jamás deben generar un reintento automático. */
export const NON_RETRYABLE_OUTCOMES: CallOutcome[] = [
  "BOOKED",
  "QUALIFIED_NOT_BOOKED",
  "TRANSFERRED",
  "NOT_INTERESTED",
  "DO_NOT_CALL",
  "WRONG_NUMBER",
];

export const AGENT_TOOL_NAMES = [
  "get_calendar_availability",
  "book_appointment",
  "reschedule_appointment",
  "cancel_appointment",
  "get_crm_contact",
  "update_crm_contact",
  "create_opportunity",
  "move_opportunity_stage",
  "add_call_note",
  "send_confirmation_sms",
  "send_follow_up_sms",
  "schedule_callback",
  "transfer_to_human",
  "mark_do_not_call",
  "end_call",
] as const;
export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

export const INTEGRATION_PROVIDERS = ["twilio", "openai", "gohighlevel", "elevenlabs"] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];
