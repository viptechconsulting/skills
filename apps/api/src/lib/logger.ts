import pino from "pino";
import { env } from "../config.js";

/**
 * Logger estructurado. Redacta cualquier campo sensible por nombre y NUNCA
 * debe recibir objetos crudos de credenciales — siempre pasar a través de
 * redactSensitive() en las capas que loguean payloads externos.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "*.password",
      "*.token",
      "*.secret",
      "*.authToken",
      "*.apiKey",
      "*.accessToken",
    ],
    censor: "[REDACTED]",
  },
});
