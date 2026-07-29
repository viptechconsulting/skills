import { z } from "zod";
import { USER_ROLES } from "../enums.js";

export const passwordSchema = z
  .string()
  .min(12, "La contraseña debe tener al menos 12 caracteres")
  .max(128)
  .regex(/[a-z]/, "Debe incluir una letra minúscula")
  .regex(/[A-Z]/, "Debe incluir una letra mayúscula")
  .regex(/[0-9]/, "Debe incluir un número")
  .regex(/[^a-zA-Z0-9]/, "Debe incluir un carácter especial");

export const registerSchema = z.object({
  organizationName: z.string().min(1).max(150),
  email: z.string().email(),
  password: passwordSchema,
  timezoneDefault: z.string().min(1).default("America/Mexico_City"),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const inviteUserSchema = z.object({
  email: z.string().email(),
  role: z.enum(USER_ROLES),
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;
