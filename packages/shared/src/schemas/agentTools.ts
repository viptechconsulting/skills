import { z } from "zod";

/**
 * Un schema Zod por herramienta del agente. El backend SIEMPRE valida los
 * argumentos que llegan del modelo contra estos schemas antes de ejecutar
 * cualquier acción externa (ver packages/adapters y apps/api tool executor).
 */

export const getCalendarAvailabilitySchema = z.object({
  callId: z.string().uuid(),
  earliestStartUtc: z.coerce.date(),
  durationMinutes: z.number().int().min(15).max(240).default(30),
});

export const proposedSlotSchema = z.object({
  startUtc: z.coerce.date(),
  endUtc: z.coerce.date(),
});

export const bookAppointmentSchema = z.object({
  callId: z.string().uuid(),
  confirmedSlot: proposedSlotSchema,
  timezone: z.string().min(1),
  notes: z.string().max(1000).optional(),
});

export const rescheduleAppointmentSchema = z.object({
  callId: z.string().uuid(),
  appointmentId: z.string().min(1),
  newSlot: proposedSlotSchema,
  timezone: z.string().min(1),
});

export const cancelAppointmentSchema = z.object({
  callId: z.string().uuid(),
  appointmentId: z.string().min(1),
  reason: z.string().max(500).optional(),
});

export const getCrmContactSchema = z.object({
  callId: z.string().uuid(),
});

export const updateCrmContactSchema = z.object({
  callId: z.string().uuid(),
  fields: z.record(z.string(), z.string().max(1000)).refine((obj) => Object.keys(obj).length > 0, {
    message: "Debe incluir al menos un campo a actualizar",
  }),
});

export const createOpportunitySchema = z.object({
  callId: z.string().uuid(),
  name: z.string().min(1).max(200),
  pipelineStage: z.string().min(1).max(200),
  value: z.number().min(0).optional(),
});

export const moveOpportunityStageSchema = z.object({
  callId: z.string().uuid(),
  opportunityId: z.string().min(1),
  newStage: z.string().min(1).max(200),
});

export const addCallNoteSchema = z.object({
  callId: z.string().uuid(),
  note: z.string().min(1).max(4000),
});

export const sendConfirmationSmsSchema = z.object({
  callId: z.string().uuid(),
  message: z.string().min(1).max(1000),
});

export const sendFollowUpSmsSchema = z.object({
  callId: z.string().uuid(),
  message: z.string().min(1).max(1000),
  delayMinutes: z.number().int().min(0).max(20160).default(0),
});

export const scheduleCallbackSchema = z.object({
  callId: z.string().uuid(),
  callbackAtUtc: z.coerce.date(),
  reason: z.string().max(500).optional(),
});

export const transferToHumanSchema = z.object({
  callId: z.string().uuid(),
  reason: z.string().min(1).max(500),
});

export const markDoNotCallSchema = z.object({
  callId: z.string().uuid(),
  reason: z.string().min(1).max(500),
});

export const endCallSchema = z.object({
  callId: z.string().uuid(),
  outcome: z.enum([
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
  ]),
  summary: z.string().min(1).max(4000),
  nextStep: z.string().max(1000).optional(),
});

export const AGENT_TOOL_SCHEMAS = {
  get_calendar_availability: getCalendarAvailabilitySchema,
  book_appointment: bookAppointmentSchema,
  reschedule_appointment: rescheduleAppointmentSchema,
  cancel_appointment: cancelAppointmentSchema,
  get_crm_contact: getCrmContactSchema,
  update_crm_contact: updateCrmContactSchema,
  create_opportunity: createOpportunitySchema,
  move_opportunity_stage: moveOpportunityStageSchema,
  add_call_note: addCallNoteSchema,
  send_confirmation_sms: sendConfirmationSmsSchema,
  send_follow_up_sms: sendFollowUpSmsSchema,
  schedule_callback: scheduleCallbackSchema,
  transfer_to_human: transferToHumanSchema,
  mark_do_not_call: markDoNotCallSchema,
  end_call: endCallSchema,
} as const;

export type AgentToolArgs = {
  [K in keyof typeof AGENT_TOOL_SCHEMAS]: z.infer<(typeof AGENT_TOOL_SCHEMAS)[K]>;
};
