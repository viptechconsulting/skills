const SENSITIVE_KEY_PATTERN =
  /token|secret|password|authorization|api[_-]?key|auth_token|credential|cookie|signature/i;

/**
 * Redacta recursivamente claves sensibles de un objeto antes de que llegue a
 * cualquier logger. Se usa en todos los puntos donde se loguean payloads
 * externos (webhooks, respuestas de proveedores, cuerpos de request).
 */
export function redactSensitive(input: unknown, depth = 0): unknown {
  if (depth > 6 || input === null || typeof input !== "object") {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map((item) => redactSensitive(item, depth + 1));
  }

  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      output[key] = "[REDACTED]";
    } else {
      output[key] = redactSensitive(value, depth + 1);
    }
  }
  return output;
}
