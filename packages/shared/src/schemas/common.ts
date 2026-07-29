import { z } from "zod";

export const e164Schema = z
  .string()
  .regex(/^\+[1-9]\d{7,14}$/, "Debe ser un número de teléfono en formato E.164 (ej. +14155552671)");

export const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Formato de hora inválido, use HH:mm");

export const allowedWindowSchema = z.object({
  start: timeOfDaySchema,
  end: timeOfDaySchema,
});

/** Validado en runtime contra la base IANA vía Luxon en la capa de servicio. */
export const timezoneSchema = z.string().min(1, "La zona horaria es requerida");

export const languageSchema = z
  .string()
  .min(2)
  .max(10)
  .regex(/^[a-z]{2}(-[A-Z]{2})?$/, "Use un código de idioma tipo 'es', 'en', 'es-MX'");

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type Pagination = z.infer<typeof paginationSchema>;
