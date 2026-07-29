import { describe, expect, it } from "vitest";
import { computeNextAttempt, type RetryPolicyConfig } from "./retry.js";

const WINDOW = { start: "09:00", end: "19:00" };

const NO_ANSWER_POLICY: RetryPolicyConfig = {
  reason: "no_answer",
  maxAttempts: 3,
  intervalMinutes: 60,
  spreadAcrossDayparts: false,
};

describe("computeNextAttempt", () => {
  it("programa un reintento cuando el outcome coincide con la razón de la política", () => {
    const result = computeNextAttempt({
      outcome: "NO_ANSWER",
      attemptCount: 1,
      campaignMaxAttempts: 5,
      policy: NO_ANSWER_POLICY,
      lastAttemptAtUtc: new Date("2026-07-29T14:00:00Z"),
      prospectTimezone: "America/Bogota",
      allowedWindow: WINDOW,
    });
    expect(result.shouldRetry).toBe(true);
    expect(result.nextAttemptAtUtc).toBeInstanceOf(Date);
  });

  it("detiene el reintento ante un outcome no reintentable (cita agendada)", () => {
    const result = computeNextAttempt({
      outcome: "BOOKED",
      attemptCount: 1,
      campaignMaxAttempts: 5,
      policy: NO_ANSWER_POLICY,
      lastAttemptAtUtc: new Date(),
      prospectTimezone: "America/Bogota",
      allowedWindow: WINDOW,
    });
    expect(result.shouldRetry).toBe(false);
    expect(result.stopReason).toBe("NON_RETRYABLE_OUTCOME");
  });

  it("detiene el reintento ante Do Not Call", () => {
    const result = computeNextAttempt({
      outcome: "DO_NOT_CALL",
      attemptCount: 0,
      campaignMaxAttempts: 5,
      policy: NO_ANSWER_POLICY,
      lastAttemptAtUtc: new Date(),
      prospectTimezone: "America/Bogota",
      allowedWindow: WINDOW,
    });
    expect(result.shouldRetry).toBe(false);
  });

  it("detiene el reintento ante número equivocado", () => {
    const result = computeNextAttempt({
      outcome: "WRONG_NUMBER",
      attemptCount: 0,
      campaignMaxAttempts: 5,
      policy: NO_ANSWER_POLICY,
      lastAttemptAtUtc: new Date(),
      prospectTimezone: "America/Bogota",
      allowedWindow: WINDOW,
    });
    expect(result.shouldRetry).toBe(false);
  });

  it("respeta el máximo global de la campaña por encima de la política", () => {
    const result = computeNextAttempt({
      outcome: "NO_ANSWER",
      attemptCount: 5,
      campaignMaxAttempts: 5,
      policy: { ...NO_ANSWER_POLICY, maxAttempts: 10 },
      lastAttemptAtUtc: new Date(),
      prospectTimezone: "America/Bogota",
      allowedWindow: WINDOW,
    });
    expect(result.shouldRetry).toBe(false);
    expect(result.stopReason).toBe("CAMPAIGN_MAX_ATTEMPTS_REACHED");
  });

  it("respeta el máximo de la política de reintento", () => {
    const result = computeNextAttempt({
      outcome: "NO_ANSWER",
      attemptCount: 3,
      campaignMaxAttempts: 10,
      policy: NO_ANSWER_POLICY,
      lastAttemptAtUtc: new Date(),
      prospectTimezone: "America/Bogota",
      allowedWindow: WINDOW,
    });
    expect(result.shouldRetry).toBe(false);
    expect(result.stopReason).toBe("POLICY_MAX_ATTEMPTS_REACHED");
  });

  it("no reintenta busy con la política de no_answer (razón distinta)", () => {
    const result = computeNextAttempt({
      outcome: "BUSY",
      attemptCount: 0,
      campaignMaxAttempts: 5,
      policy: NO_ANSWER_POLICY,
      lastAttemptAtUtc: new Date(),
      prospectTimezone: "America/Bogota",
      allowedWindow: WINDOW,
    });
    expect(result.shouldRetry).toBe(false);
  });

  it("siempre agenda el próximo intento dentro de la ventana permitida", () => {
    const result = computeNextAttempt({
      outcome: "NO_ANSWER",
      attemptCount: 1,
      campaignMaxAttempts: 5,
      policy: { ...NO_ANSWER_POLICY, intervalMinutes: 60 * 20 },
      lastAttemptAtUtc: new Date("2026-07-29T20:00:00Z"),
      prospectTimezone: "America/Bogota",
      allowedWindow: WINDOW,
    });
    expect(result.shouldRetry).toBe(true);
    expect(result.nextAttemptAtUtc).toBeInstanceOf(Date);
  });
});
