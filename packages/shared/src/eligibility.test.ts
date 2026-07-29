import { describe, expect, it } from "vitest";
import { evaluateCallEligibility, type EligibilityInput } from "./eligibility.js";

const WINDOW = { start: "09:00", end: "19:00" };
const NOON_BOGOTA_UTC = new Date("2026-07-29T16:00:00Z"); // 11:00 en Bogota (UTC-5), dentro de ventana

function baseInput(overrides: Partial<EligibilityInput> = {}): EligibilityInput {
  return {
    phoneE164: "+573001234567",
    consentRequired: true,
    consentGiven: true,
    isOnDoNotCallList: false,
    isProspectBlocked: false,
    campaignStatus: "active",
    prospectTimezone: "America/Bogota",
    allowedWindow: WINDOW,
    attemptCount: 0,
    maxAttempts: 3,
    activeCallStatuses: [],
    hasFutureActiveAppointment: false,
    evaluateAt: NOON_BOGOTA_UTC,
    ...overrides,
  };
}

describe("evaluateCallEligibility", () => {
  it("es elegible cuando todo cumple", () => {
    const result = evaluateCallEligibility(baseInput());
    expect(result.eligible).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("rechaza número inválido", () => {
    const result = evaluateCallEligibility(baseInput({ phoneE164: "not-a-number" }));
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("INVALID_PHONE_NUMBER");
  });

  it("rechaza por prospecto bloqueado antes que cualquier otra razón", () => {
    const result = evaluateCallEligibility(
      baseInput({ isProspectBlocked: true, isOnDoNotCallList: true, consentGiven: false }),
    );
    expect(result.reason).toBe("PROSPECT_BLOCKED");
  });

  it("rechaza por Do Not Call", () => {
    const result = evaluateCallEligibility(baseInput({ isOnDoNotCallList: true }));
    expect(result.reason).toBe("DO_NOT_CALL_LISTED");
  });

  it("rechaza por falta de consentimiento cuando es requerido", () => {
    const result = evaluateCallEligibility(baseInput({ consentGiven: false }));
    expect(result.reason).toBe("CONSENT_REQUIRED_NOT_GIVEN");
  });

  it("permite sin consentimiento si la campaña no lo requiere", () => {
    const result = evaluateCallEligibility(baseInput({ consentRequired: false, consentGiven: false }));
    expect(result.eligible).toBe(true);
  });

  it("rechaza si la campaña no está activa", () => {
    const result = evaluateCallEligibility(baseInput({ campaignStatus: "paused" }));
    expect(result.reason).toBe("CAMPAIGN_NOT_ACTIVE");
  });

  it("rechaza fuera de la ventana horaria local", () => {
    const lateNight = new Date("2026-07-30T02:00:00Z"); // 21:00 en Bogota
    const result = evaluateCallEligibility(baseInput({ evaluateAt: lateNight }));
    expect(result.reason).toBe("OUTSIDE_ALLOWED_WINDOW");
  });

  it("rechaza al alcanzar el máximo de intentos", () => {
    const result = evaluateCallEligibility(baseInput({ attemptCount: 3, maxAttempts: 3 }));
    expect(result.reason).toBe("MAX_ATTEMPTS_REACHED");
  });

  it("rechaza si existe una llamada activa no terminal", () => {
    const result = evaluateCallEligibility(baseInput({ activeCallStatuses: ["ringing"] }));
    expect(result.reason).toBe("ACTIVE_CALL_IN_PROGRESS");
  });

  it("permite si las llamadas previas están todas en estado terminal", () => {
    const result = evaluateCallEligibility(baseInput({ activeCallStatuses: ["no_answer", "failed"] }));
    expect(result.eligible).toBe(true);
  });

  it("rechaza si ya existe una cita futura activa", () => {
    const result = evaluateCallEligibility(baseInput({ hasFutureActiveAppointment: true }));
    expect(result.reason).toBe("FUTURE_APPOINTMENT_EXISTS");
  });
});
