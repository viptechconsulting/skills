import pino from "pino";
import { env } from "../config.js";

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: ["*.password", "*.token", "*.secret", "*.authToken", "*.apiKey", "*.accessToken"],
    censor: "[REDACTED]",
  },
});
