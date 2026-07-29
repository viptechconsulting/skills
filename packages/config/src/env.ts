import { z } from "zod";

const boolFromString = z
  .union([z.literal("true"), z.literal("false"), z.boolean()])
  .transform((v) => (typeof v === "boolean" ? v : v === "true"));

/**
 * Superset de todas las variables de entorno usadas por cualquier app del
 * monorepo. Cada app valida solo el subconjunto que necesita (ver
 * apps/api/src/config.ts, apps/worker/src/config.ts, apps/web env.ts) pero
 * comparten esta única definición para evitar divergencias de nombres.
 */
export const baseEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  API_BASE_URL: z.string().url().default("http://localhost:4000"),
  PORT_API: z.coerce.number().int().default(4000),
  PORT_WORKER: z.coerce.number().int().default(4100),
  PORT_WEB: z.coerce.number().int().default(3000),

  JWT_SECRET: z.string().min(32, "JWT_SECRET debe tener al menos 32 caracteres"),
  SESSION_COOKIE_NAME: z.string().default("lynkro_session"),
  ENCRYPTION_KEY: z
    .string()
    .min(32, "ENCRYPTION_KEY debe tener al menos 32 caracteres (se usa para derivar una clave AES-256)"),
  CORS_ALLOWED_ORIGINS: z.string().default("http://localhost:3000"),

  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1).optional(),

  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),

  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),

  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_DEFAULT_FROM_NUMBER: z.string().optional(),
  TWILIO_WEBHOOK_BASE_URL: z.string().url().default("http://localhost:4000"),

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_REALTIME_MODEL: z.string().default("gpt-4o-realtime-preview"),

  GHL_BASE_URL: z.string().url().default("https://services.leadconnectorhq.com"),
  GHL_CLIENT_ID: z.string().optional(),
  GHL_CLIENT_SECRET: z.string().optional(),
  GHL_SHARED_SECRET: z.string().optional(),

  SIMULATION_MODE: boolFromString.default(true),

  DEFAULT_ALLOWED_CALL_WINDOW_START: z.string().default("09:00"),
  DEFAULT_ALLOWED_CALL_WINDOW_END: z.string().default("19:00"),
  RECORDING_ENABLED_DEFAULT: boolFromString.default(false),
  TRANSCRIPT_RETENTION_DAYS: z.coerce.number().int().min(0).default(90),

  RATE_LIMIT_MAX: z.coerce.number().int().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().default(60_000),
});

export type BaseEnv = z.infer<typeof baseEnvSchema>;

export class EnvValidationError extends Error {
  constructor(public readonly issues: z.ZodIssue[]) {
    super(
      `Variables de entorno inválidas o faltantes:\n${issues
        .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
        .join("\n")}`,
    );
    this.name = "EnvValidationError";
  }
}

/**
 * Valida `process.env` (o el objeto provisto) contra un schema derivado de
 * baseEnvSchema. Lanza EnvValidationError con un mensaje claro y sin exponer
 * los valores de las variables (solo nombres y motivo) si algo falta.
 *
 * Las cadenas vacías se tratan como "no definido": un `.env` de ejemplo con
 * variables opcionales dejadas en blanco (ej. `SUPABASE_URL=`) no debe
 * fallar la validación de una URL opcional.
 */
export function loadEnv<T extends z.ZodTypeAny>(schema: T, source: Record<string, unknown> = process.env): z.infer<T> {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    normalized[key] = value === "" ? undefined : value;
  }

  const result = schema.safeParse(normalized);
  if (!result.success) {
    throw new EnvValidationError(result.error.issues);
  }
  return result.data;
}
