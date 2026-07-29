import type { AvailabilitySlot, BookAppointmentInput, CalendarProvider } from "./CalendarProvider.js";
import type { GhlConfig } from "../crm/ghlCrmProvider.js";

async function ghlFetch<T>(config: GhlConfig, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
      Version: "2021-07-28",
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`GoHighLevel API error ${response.status}: ${body}`);
  }

  return (await response.json()) as T;
}

export class GhlCalendarProvider implements CalendarProvider {
  constructor(private readonly config: GhlConfig) {}

  async getAvailability(input: {
    calendarId: string;
    earliestStartUtc: Date;
    durationMinutes: number;
  }): Promise<AvailabilitySlot[]> {
    const startMs = input.earliestStartUtc.getTime();
    const endMs = startMs + 14 * 24 * 60 * 60 * 1000; // busca dos semanas hacia adelante

    const result = await ghlFetch<{ slots: Record<string, string[]> }>(
      this.config,
      `/calendars/${input.calendarId}/free-slots?startDate=${startMs}&endDate=${endMs}`,
    );

    const slots: AvailabilitySlot[] = [];
    for (const isoTimes of Object.values(result.slots ?? {})) {
      for (const iso of isoTimes) {
        const startUtc = new Date(iso);
        const endUtc = new Date(startUtc.getTime() + input.durationMinutes * 60_000);
        slots.push({ startUtc, endUtc });
      }
    }

    return slots.sort((a, b) => a.startUtc.getTime() - b.startUtc.getTime());
  }

  async bookAppointment(input: BookAppointmentInput): Promise<{ appointmentId: string }> {
    const result = await ghlFetch<{ id: string }>(this.config, "/calendars/events/appointments", {
      method: "POST",
      body: JSON.stringify({
        calendarId: input.calendarId,
        contactId: input.contactId,
        startTime: input.startUtc.toISOString(),
        endTime: input.endUtc.toISOString(),
        title: input.title,
      }),
    });
    return { appointmentId: result.id };
  }

  async rescheduleAppointment(input: {
    appointmentId: string;
    newStartUtc: Date;
    newEndUtc: Date;
  }): Promise<void> {
    await ghlFetch(this.config, `/calendars/events/appointments/${input.appointmentId}`, {
      method: "PUT",
      body: JSON.stringify({
        startTime: input.newStartUtc.toISOString(),
        endTime: input.newEndUtc.toISOString(),
      }),
    });
  }

  async cancelAppointment(appointmentId: string): Promise<void> {
    await ghlFetch(this.config, `/calendars/events/appointments/${appointmentId}`, {
      method: "PUT",
      body: JSON.stringify({ appointmentStatus: "cancelled" }),
    });
  }
}
