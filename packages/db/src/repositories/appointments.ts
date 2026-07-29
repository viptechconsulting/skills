import type { PrismaClient } from "../../generated/client/index.js";

export interface CreateAppointmentInput {
  organizationId: string;
  prospectId: string;
  callId?: string;
  ghlAppointmentId?: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
}

export type CreateAppointmentResult =
  | { ok: true; appointment: Awaited<ReturnType<PrismaClient["appointment"]["create"]>> }
  | { ok: false; reason: "OVERLAPPING_APPOINTMENT" };

/**
 * Crea una cita solo si no se solapa con otra cita activa del mismo
 * prospecto. Se ejecuta dentro de una transacción para evitar condiciones
 * de carrera (dos tool calls de reserva casi simultáneas para el mismo
 * prospecto) que produzcan una doble reserva.
 */
export async function createAppointmentIfNoOverlap(
  db: PrismaClient,
  input: CreateAppointmentInput,
): Promise<CreateAppointmentResult> {
  return db.$transaction(async (tx) => {
    const overlapping = await tx.appointment.findFirst({
      where: {
        organizationId: input.organizationId,
        prospectId: input.prospectId,
        status: { in: ["scheduled", "confirmed", "rescheduled"] },
        startsAt: { lt: input.endsAt },
        endsAt: { gt: input.startsAt },
      },
    });

    if (overlapping) {
      return { ok: false, reason: "OVERLAPPING_APPOINTMENT" } as const;
    }

    const appointment = await tx.appointment.create({
      data: {
        organizationId: input.organizationId,
        prospectId: input.prospectId,
        callId: input.callId,
        ghlAppointmentId: input.ghlAppointmentId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        timezone: input.timezone,
        status: "scheduled",
      },
    });

    return { ok: true, appointment } as const;
  });
}

export function findFutureActiveAppointment(db: PrismaClient, organizationId: string, prospectId: string) {
  return db.appointment.findFirst({
    where: {
      organizationId,
      prospectId,
      status: { in: ["scheduled", "confirmed", "rescheduled"] },
      startsAt: { gt: new Date() },
    },
  });
}

export function cancelAppointmentScoped(db: PrismaClient, organizationId: string, appointmentId: string) {
  return db.appointment.updateMany({
    where: { id: appointmentId, organizationId },
    data: { status: "canceled" },
  });
}
