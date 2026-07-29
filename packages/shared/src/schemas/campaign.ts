import { z } from "zod";
import { allowedWindowSchema, languageSchema, timezoneSchema } from "./common.js";
import { CAMPAIGN_STATUSES, RETRY_REASONS } from "../enums.js";

export const qualificationQuestionSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1).max(500),
  required: z.boolean().default(true),
});

export const retryPolicyInputSchema = z.object({
  reason: z.enum(RETRY_REASONS),
  maxAttempts: z.number().int().min(0).max(10),
  intervalMinutes: z.number().int().min(5).max(20160),
  spreadAcrossDayparts: z.boolean().default(true),
});

export const postCallBehaviorSchema = z.object({
  sendConfirmationSmsOnBooking: z.boolean().default(true),
  sendFollowUpOnNoAnswer: z.boolean().default(false),
  followUpDelayMinutes: z.number().int().min(1).max(20160).default(1440),
});

export const createCampaignSchema = z.object({
  name: z.string().min(1).max(150),
  description: z.string().max(2000).optional().default(""),
  language: languageSchema,
  objective: z.string().min(1).max(1000),
  allowedWindow: allowedWindowSchema,
  timezoneDefault: timezoneSchema,
  outboundPhoneNumberId: z.string().uuid(),
  maxAttempts: z.number().int().min(1).max(10),
  attemptIntervalMinutes: z.number().int().min(5).max(20160),
  targetCalendarId: z.string().min(1).optional(),
  voiceAgentId: z.string().uuid(),
  agentInstructions: z.string().min(1).max(4000),
  qualificationQuestions: z.array(qualificationQuestionSchema).max(20).default([]),
  bookingConditions: z.string().max(2000).default(""),
  transferConditions: z.string().max(2000).default(""),
  voicemailMessage: z.string().max(1000).default(""),
  postCallBehavior: postCallBehaviorSchema.default({
    sendConfirmationSmsOnBooking: true,
    sendFollowUpOnNoAnswer: false,
    followUpDelayMinutes: 1440,
  }),
  retryPolicies: z.array(retryPolicyInputSchema).max(RETRY_REASONS.length).default([]),
  recordingEnabled: z.boolean().default(false),
  simulationMode: z.boolean().default(true),
  consentRequired: z.boolean().default(true),
});
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

export const updateCampaignSchema = createCampaignSchema.partial().extend({
  status: z.enum(CAMPAIGN_STATUSES).optional(),
});
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;
