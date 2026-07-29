import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

export interface PhoneNormalizationResult {
  ok: boolean;
  e164?: string;
  reason?: string;
}

/**
 * Normaliza un número de teléfono a formato E.164. Requiere que el número
 * ya incluya un código de país (+) o se provea un país por defecto, ya que
 * adivinar el país de un número ambiguo produciría normalizaciones
 * incorrectas y llamadas a números equivocados.
 */
export function normalizePhoneToE164(
  rawInput: string,
  defaultCountry?: CountryCode,
): PhoneNormalizationResult {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { ok: false, reason: "EMPTY_INPUT" };
  }

  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry);

  if (!parsed) {
    return { ok: false, reason: "UNPARSEABLE" };
  }

  if (!parsed.isValid()) {
    return { ok: false, reason: "INVALID_NUMBER" };
  }

  return { ok: true, e164: parsed.number };
}

const E164_REGEX = /^\+[1-9]\d{7,14}$/;

export function isE164(value: string): boolean {
  return E164_REGEX.test(value);
}
