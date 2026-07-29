import { describe, expect, it } from "vitest";
import {
  InvalidCallTransitionError,
  assertValidTransition,
  canTransition,
  isTerminalCallStatus,
} from "./callStateMachine.js";

describe("callStateMachine", () => {
  it("permite transiciones válidas del flujo feliz", () => {
    expect(canTransition("draft", "queued")).toBe(true);
    expect(canTransition("queued", "dialing")).toBe(true);
    expect(canTransition("dialing", "initiated")).toBe(true);
    expect(canTransition("initiated", "ringing")).toBe(true);
    expect(canTransition("ringing", "answered")).toBe(true);
    expect(canTransition("answered", "human_detected")).toBe(true);
    expect(canTransition("human_detected", "in_progress")).toBe(true);
    expect(canTransition("in_progress", "completed")).toBe(true);
  });

  it("rechaza saltos de estado inválidos", () => {
    expect(canTransition("draft", "completed")).toBe(false);
    expect(canTransition("queued", "in_progress")).toBe(false);
    expect(canTransition("completed", "queued")).toBe(false);
  });

  it("rechaza transición a sí mismo", () => {
    expect(canTransition("ringing", "ringing")).toBe(false);
  });

  it("assertValidTransition lanza InvalidCallTransitionError en transición inválida", () => {
    expect(() => assertValidTransition("draft", "completed")).toThrow(InvalidCallTransitionError);
  });

  it("assertValidTransition no lanza en transición válida", () => {
    expect(() => assertValidTransition("queued", "dialing")).not.toThrow();
  });

  it("identifica estados terminales", () => {
    expect(isTerminalCallStatus("completed")).toBe(true);
    expect(isTerminalCallStatus("failed")).toBe(true);
    expect(isTerminalCallStatus("canceled")).toBe(true);
    expect(isTerminalCallStatus("blocked")).toBe(true);
    expect(isTerminalCallStatus("in_progress")).toBe(false);
    expect(isTerminalCallStatus("queued")).toBe(false);
  });

  it("no permite transiciones desde estados terminales", () => {
    expect(canTransition("completed", "in_progress")).toBe(false);
    expect(canTransition("failed", "queued")).toBe(false);
    expect(canTransition("blocked", "queued")).toBe(false);
  });
});
