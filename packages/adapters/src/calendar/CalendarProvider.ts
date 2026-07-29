export interface AvailabilitySlot {
  startUtc: Date;
  endUtc: Date;
}

export interface BookAppointmentInput {
  calendarId: string;
  contactId: string;
  startUtc: Date;
  endUtc: Date;
  timezone: string;
  title: string;
}

export interface CalendarProvider {
  getAvailability(input: { calendarId: string; earliestStartUtc: Date; durationMinutes: number }): Promise<AvailabilitySlot[]>;
  bookAppointment(input: BookAppointmentInput): Promise<{ appointmentId: string }>;
  rescheduleAppointment(input: { appointmentId: string; newStartUtc: Date; newEndUtc: Date }): Promise<void>;
  cancelAppointment(appointmentId: string): Promise<void>;
}
