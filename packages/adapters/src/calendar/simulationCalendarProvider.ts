import { randomUUID } from "node:crypto";
import type { AvailabilitySlot, BookAppointmentInput, CalendarProvider } from "./CalendarProvider.js";

interface BookedAppointment {
  id: string;
  calendarId: string;
  startUtc: Date;
  endUtc: Date;
  canceled: boolean;
}

/**
 * Calendario en memoria para simulación/pruebas. Genera slots cada 30
 * minutos dentro de horario 09:00-18:00 (hora del servidor) durante 5 días
 * hábiles a partir de earliestStartUtc, excluyendo los ya reservados.
 */
export class SimulationCalendarProvider implements CalendarProvider {
  private appointments = new Map<string, BookedAppointment>();

  async getAvailability(input: {
    calendarId: string;
    earliestStartUtc: Date;
    durationMinutes: number;
  }): Promise<AvailabilitySlot[]> {
    const slots: AvailabilitySlot[] = [];
    let cursor = new Date(input.earliestStartUtc);
    cursor.setUTCMinutes(0, 0, 0);

    for (let i = 0; i < 200 && slots.length < 10; i += 1) {
      cursor = new Date(cursor.getTime() + 30 * 60_000);
      const hour = cursor.getUTCHours();
      if (hour < 9 || hour >= 18) continue;

      const endUtc = new Date(cursor.getTime() + input.durationMinutes * 60_000);
      const overlaps = [...this.appointments.values()].some(
        (a) => !a.canceled && a.calendarId === input.calendarId && a.startUtc < endUtc && a.endUtc > cursor,
      );
      if (!overlaps) {
        slots.push({ startUtc: new Date(cursor), endUtc });
      }
    }

    return slots;
  }

  async bookAppointment(input: BookAppointmentInput): Promise<{ appointmentId: string }> {
    const overlapping = [...this.appointments.values()].some(
      (a) =>
        !a.canceled &&
        a.calendarId === input.calendarId &&
        a.startUtc < input.endUtc &&
        a.endUtc > input.startUtc,
    );
    if (overlapping) {
      throw new Error("SLOT_ALREADY_BOOKED");
    }

    const id = randomUUID();
    this.appointments.set(id, {
      id,
      calendarId: input.calendarId,
      startUtc: input.startUtc,
      endUtc: input.endUtc,
      canceled: false,
    });
    return { appointmentId: id };
  }

  async rescheduleAppointment(input: { appointmentId: string; newStartUtc: Date; newEndUtc: Date }): Promise<void> {
    const appointment = this.appointments.get(input.appointmentId);
    if (!appointment) throw new Error("APPOINTMENT_NOT_FOUND");
    appointment.startUtc = input.newStartUtc;
    appointment.endUtc = input.newEndUtc;
  }

  async cancelAppointment(appointmentId: string): Promise<void> {
    const appointment = this.appointments.get(appointmentId);
    if (appointment) {
      appointment.canceled = true;
    }
  }
}
