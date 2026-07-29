import { describe, expect, it } from "vitest";
import { SimulationCalendarProvider } from "./simulationCalendarProvider.js";

describe("SimulationCalendarProvider", () => {
  it("devuelve slots disponibles dentro de horario laboral", async () => {
    const provider = new SimulationCalendarProvider();
    const slots = await provider.getAvailability({
      calendarId: "cal-1",
      earliestStartUtc: new Date("2026-08-03T00:00:00Z"),
      durationMinutes: 30,
    });

    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      expect(slot.startUtc.getUTCHours()).toBeGreaterThanOrEqual(9);
      expect(slot.startUtc.getUTCHours()).toBeLessThan(18);
    }
  });

  it("rechaza una reserva duplicada que se solapa con una existente", async () => {
    const provider = new SimulationCalendarProvider();
    const start = new Date("2026-08-03T15:00:00Z");
    const end = new Date("2026-08-03T15:30:00Z");

    await provider.bookAppointment({
      calendarId: "cal-1",
      contactId: "contact-1",
      startUtc: start,
      endUtc: end,
      timezone: "America/Bogota",
      title: "Diagnóstico Lynkro",
    });

    await expect(
      provider.bookAppointment({
        calendarId: "cal-1",
        contactId: "contact-2",
        startUtc: new Date("2026-08-03T15:15:00Z"),
        endUtc: new Date("2026-08-03T15:45:00Z"),
        timezone: "America/Bogota",
        title: "Otra cita",
      }),
    ).rejects.toThrow("SLOT_ALREADY_BOOKED");
  });

  it("excluye slots ya reservados de la disponibilidad", async () => {
    const provider = new SimulationCalendarProvider();
    const start = new Date("2026-08-03T15:00:00Z");
    const end = new Date("2026-08-03T15:30:00Z");

    await provider.bookAppointment({
      calendarId: "cal-1",
      contactId: "contact-1",
      startUtc: start,
      endUtc: end,
      timezone: "America/Bogota",
      title: "Diagnóstico Lynkro",
    });

    const slots = await provider.getAvailability({
      calendarId: "cal-1",
      earliestStartUtc: new Date("2026-08-03T14:00:00Z"),
      durationMinutes: 30,
    });

    const overlapsBooked = slots.some((s) => s.startUtc.getTime() === start.getTime());
    expect(overlapsBooked).toBe(false);
  });

  it("permite reservar tras cancelar una cita previa en el mismo horario", async () => {
    const provider = new SimulationCalendarProvider();
    const start = new Date("2026-08-03T15:00:00Z");
    const end = new Date("2026-08-03T15:30:00Z");

    const { appointmentId } = await provider.bookAppointment({
      calendarId: "cal-1",
      contactId: "contact-1",
      startUtc: start,
      endUtc: end,
      timezone: "America/Bogota",
      title: "Diagnóstico Lynkro",
    });

    await provider.cancelAppointment(appointmentId);

    await expect(
      provider.bookAppointment({
        calendarId: "cal-1",
        contactId: "contact-2",
        startUtc: start,
        endUtc: end,
        timezone: "America/Bogota",
        title: "Nueva cita",
      }),
    ).resolves.toBeDefined();
  });
});
