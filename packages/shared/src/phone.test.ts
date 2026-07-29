import { describe, expect, it } from "vitest";
import { isE164, normalizePhoneToE164 } from "./phone.js";

describe("normalizePhoneToE164", () => {
  it("normaliza un número con código de país explícito", () => {
    const result = normalizePhoneToE164("+1 415 555 2671");
    expect(result.ok).toBe(true);
    expect(result.e164).toBe("+14155552671");
  });

  it("normaliza un número local usando el país por defecto", () => {
    const result = normalizePhoneToE164("55 1234 5678", "MX");
    expect(result.ok).toBe(true);
    expect(result.e164?.startsWith("+52")).toBe(true);
  });

  it("rechaza un número inválido", () => {
    const result = normalizePhoneToE164("123", "US");
    expect(result.ok).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it("rechaza entrada vacía", () => {
    const result = normalizePhoneToE164("   ");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("EMPTY_INPUT");
  });

  it("rechaza texto no parseable como teléfono", () => {
    const result = normalizePhoneToE164("no-es-un-telefono");
    expect(result.ok).toBe(false);
  });
});

describe("isE164", () => {
  it("acepta formato E.164 válido", () => {
    expect(isE164("+14155552671")).toBe(true);
  });

  it("rechaza formato sin +", () => {
    expect(isE164("14155552671")).toBe(false);
  });

  it("rechaza formato con letras", () => {
    expect(isE164("+1415abc2671")).toBe(false);
  });
});
