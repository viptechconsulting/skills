import { z } from "zod";

/**
 * Twilio envía application/x-www-form-urlencoded; los campos numéricos y
 * booleanos llegan como strings. Estos schemas reflejan los payloads reales
 * documentados de Twilio Voice status callbacks, AMD y grabaciones.
 */

export const twilioVoiceStatusCallbackSchema = z.object({
  CallSid: z.string().min(1),
  CallStatus: z.enum([
    "queued",
    "initiated",
    "ringing",
    "in-progress",
    "completed",
    "busy",
    "failed",
    "no-answer",
    "canceled",
  ]),
  Timestamp: z.string().optional(),
  CallDuration: z.string().optional(),
  SequenceNumber: z.string().optional(),
  Direction: z.string().optional(),
  From: z.string().optional(),
  To: z.string().optional(),
  ErrorCode: z.string().optional(),
  ErrorMessage: z.string().optional(),
});
export type TwilioVoiceStatusCallback = z.infer<typeof twilioVoiceStatusCallbackSchema>;

export const twilioAmdCallbackSchema = z.object({
  CallSid: z.string().min(1),
  AnsweredBy: z.enum([
    "human",
    "machine_start",
    "machine_end_beep",
    "machine_end_silence",
    "machine_end_other",
    "fax",
    "unknown",
  ]),
  MachineDetectionDuration: z.string().optional(),
});
export type TwilioAmdCallback = z.infer<typeof twilioAmdCallbackSchema>;

export const twilioRecordingCallbackSchema = z.object({
  CallSid: z.string().min(1),
  RecordingSid: z.string().min(1),
  RecordingUrl: z.string().url(),
  RecordingStatus: z.enum(["completed", "failed", "absent"]),
  RecordingDuration: z.string().optional(),
});
export type TwilioRecordingCallback = z.infer<typeof twilioRecordingCallbackSchema>;
