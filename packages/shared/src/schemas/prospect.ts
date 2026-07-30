import { z } from "zod";
import { languageSchema, timezoneSchema } from "./common.js";

export const createProspectSchema = z.object({
  name: z.string().min(1).max(150),
  phone: z.string().min(3).max(30),
  defaultCountry: z
    .string()
    .length(2)
    .optional()
    .describe("Código ISO de país (ej. MX, US) usado solo si el número no incluye código de país"),
  company: z.string().max(200).optional().default(""),
  email: z.string().email().optional(),
  language: languageSchema,
  timezone: timezoneSchema,
  context: z.string().max(4000).optional().default(""),
  intent: z.string().min(1).max(1000),
  desiredOutcome: z.string().min(1).max(1000),
  source: z.string().min(1).max(200),
  consentGiven: z.boolean(),
  consentDate: z.coerce.date().optional(),
  tags: z.array(z.string().max(50)).max(20).default([]),
  campaignId: z.string().uuid().optional(),
});
export type CreateProspectInput = z.infer<typeof createProspectSchema>;

export const updateProspectSchema = createProspectSchema.partial().extend({
  campaignId: z.string().uuid().nullable().optional(),
});
export type UpdateProspectInput = z.infer<typeof updateProspectSchema>;

/** Fila cruda tal como llega de un CSV importado (antes de normalizar). */
export const csvProspectRowSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(3),
  company: z.string().optional().default(""),
  email: z.string().optional(),
  language: z.string().min(2),
  timezone: z.string().min(1),
  context: z.string().optional().default(""),
  intent: z.string().min(1),
  desiredOutcome: z.string().min(1),
  source: z.string().min(1),
  consentGiven: z
    .union([z.string(), z.boolean()])
    .transform((v) => (typeof v === "string" ? ["true", "1", "yes", "si", "sí"].includes(v.trim().toLowerCase()) : v)),
  consentDate: z.string().optional(),
  tags: z.string().optional().default(""),
  campaignId: z.string().optional(),
});
export type CsvProspectRow = z.infer<typeof csvProspectRowSchema>;

export const scheduleCallSchema = z.object({
  scheduledAtUtc: z.coerce.date(),
});

export const csvImportResultSchema = z.object({
  totalRows: z.number().int().min(0),
  created: z.number().int().min(0),
  updatedDuplicates: z.number().int().min(0),
  rejected: z.number().int().min(0),
  errors: z.array(
    z.object({
      row: z.number().int(),
      message: z.string(),
    }),
  ),
});
export type CsvImportResult = z.infer<typeof csvImportResultSchema>;
