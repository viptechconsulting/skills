import pino from "pino";

/**
 * Logger estructurado propio de packages/domain, independiente del logger
 * HTTP de apps/api, para que este paquete no dependa de ninguna app.
 * Redacta cualquier campo sensible por nombre.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: ["*.password", "*.token", "*.secret", "*.authToken", "*.apiKey", "*.accessToken"],
    censor: "[REDACTED]",
  },
});
