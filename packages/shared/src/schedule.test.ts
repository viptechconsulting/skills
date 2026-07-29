import { describe, expect, it } from "vitest";
import { isWithinAllowedWindow, nextInstantWithinWindow } from "./schedule.js";

const WINDOW = { start: "09:00", end: "19:00" };

describe("isWithinAllowedWindow", () => {
  it("acepta un instante dentro de la ventana en la zona local", () => {
    // 15:00 UTC == 09:00 en America/Bogota (UTC-5) - borde inferior
    const instant = new Date("2026-07-29T14:00:00Z"); // 09:00 en Bogota
    expect(isWithinAllowedWindow(instant, "America/Bogota", WINDOW)).toBe(true);
  });

  it("rechaza un instante antes de la ventana", () => {
    const instant = new Date("2026-07-29T06:00:00Z"); // 01:00 en Bogota
    expect(isWithinAllowedWindow(instant, "America/Bogota", WINDOW)).toBe(false);
  });

  it("rechaza un instante después de la ventana", () => {
    const instant = new Date("2026-07-30T01:00:00Z"); // 20:00 en Bogota
    expect(isWithinAllowedWindow(instant, "America/Bogota", WINDOW)).toBe(false);
  });

  it("soporta ventanas que cruzan medianoche", () => {
    const crossMidnight = { start: "22:00", end: "02:00" };
    const lateNight = new Date("2026-07-30T04:00:00Z"); // 23:00 en Bogota (UTC-5)
    expect(isWithinAllowedWindow(lateNight, "America/Bogota", crossMidnight)).toBe(true);
    const midday = new Date("2026-07-29T18:00:00Z"); // 13:00 en Bogota
    expect(isWithinAllowedWindow(midday, "America/Bogota", crossMidnight)).toBe(false);
  });

  it("lanza error con zona horaria inválida", () => {
    expect(() => isWithinAllowedWindow(new Date(), "No/Existe", WINDOW)).toThrow();
  });
});

describe("nextInstantWithinWindow", () => {
  it("devuelve el mismo instante si ya está dentro de la ventana", () => {
    const instant = new Date("2026-07-29T14:00:00Z");
    const next = nextInstantWithinWindow(instant, "America/Bogota", WINDOW);
    expect(next.getTime()).toBe(instant.getTime());
  });

  it("adelanta al siguiente inicio de ventana si está fuera de horario", () => {
    const instant = new Date("2026-07-30T01:00:00Z"); // 20:00 en Bogota (fuera)
    const next = nextInstantWithinWindow(instant, "America/Bogota", WINDOW);
    expect(isWithinAllowedWindow(next, "America/Bogota", WINDOW)).toBe(true);
    expect(next.getTime()).toBeGreaterThan(instant.getTime());
  });
});
