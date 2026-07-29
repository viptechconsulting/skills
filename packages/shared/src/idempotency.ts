import { createHash } from "node:crypto";

/**
 * Deriva una clave de idempotencia determinística a partir de las partes de
 * un evento externo (ej. Twilio CallSid + tipo de evento + SequenceNumber).
 * La misma combinación de partes siempre produce la misma clave, permitiendo
 * detectar y descartar reintentos/duplicados de webhooks sin estado externo.
 */
export function buildIdempotencyKey(...parts: Array<string | number | undefined | null>): string {
  const normalized = parts
    .map((p) => (p === undefined || p === null ? "" : String(p)))
    .join("::");
  return createHash("sha256").update(normalized).digest("hex");
}
