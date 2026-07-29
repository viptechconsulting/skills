import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestPrismaClient, resetTestDatabase, seedOrganizationFixture } from "../testUtils.js";
import { createAppointmentIfNoOverlap, findFutureActiveAppointment } from "./appointments.js";

const db = createTestPrismaClient();

beforeEach(async () => {
  await resetTestDatabase(db);
});

afterAll(async () => {
  await db.$disconnect();
});

async function createTestProspect(organizationId: string, campaignId: string) {
  return db.prospect.create({
    data: {
      organizationId,
      campaignId,
      name: "Prospecto de cita",
      phoneE164: "+14155550055",
      timezone: "America/Bogota",
      intent: "test",
      desiredOutcome: "test",
      source: "test",
    },
  });
}

describe("anti doble-reserva de citas", () => {
  it("permite la primera reserva y rechaza una que se solapa", async () => {
    const org = await seedOrganizationFixture(db, "Booking");
    const prospect = await createTestProspect(org.organizationId, org.campaignId);

    const start = new Date("2026-08-03T15:00:00Z");
    const end = new Date("2026-08-03T15:30:00Z");

    const first = await createAppointmentIfNoOverlap(db, {
      organizationId: org.organizationId,
      prospectId: prospect.id,
      startsAt: start,
      endsAt: end,
      timezone: "America/Bogota",
    });
    expect(first.ok).toBe(true);

    // Se solapa parcialmente con la cita anterior.
    const overlappingStart = new Date("2026-08-03T15:15:00Z");
    const overlappingEnd = new Date("2026-08-03T15:45:00Z");

    const second = await createAppointmentIfNoOverlap(db, {
      organizationId: org.organizationId,
      prospectId: prospect.id,
      startsAt: overlappingStart,
      endsAt: overlappingEnd,
      timezone: "America/Bogota",
    });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.reason).toBe("OVERLAPPING_APPOINTMENT");
    }
  });

  it("permite reservas consecutivas que no se solapan", async () => {
    const org = await seedOrganizationFixture(db, "Booking2");
    const prospect = await createTestProspect(org.organizationId, org.campaignId);

    const first = await createAppointmentIfNoOverlap(db, {
      organizationId: org.organizationId,
      prospectId: prospect.id,
      startsAt: new Date("2026-08-03T15:00:00Z"),
      endsAt: new Date("2026-08-03T15:30:00Z"),
      timezone: "America/Bogota",
    });
    const second = await createAppointmentIfNoOverlap(db, {
      organizationId: org.organizationId,
      prospectId: prospect.id,
      startsAt: new Date("2026-08-03T15:30:00Z"),
      endsAt: new Date("2026-08-03T16:00:00Z"),
      timezone: "America/Bogota",
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
  });

  it("findFutureActiveAppointment detecta una cita futura activa", async () => {
    const org = await seedOrganizationFixture(db, "Booking3");
    const prospect = await createTestProspect(org.organizationId, org.campaignId);

    expect(await findFutureActiveAppointment(db, org.organizationId, prospect.id)).toBeNull();

    await createAppointmentIfNoOverlap(db, {
      organizationId: org.organizationId,
      prospectId: prospect.id,
      startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      endsAt: new Date(Date.now() + 25 * 60 * 60 * 1000),
      timezone: "America/Bogota",
    });

    expect(await findFutureActiveAppointment(db, org.organizationId, prospect.id)).not.toBeNull();
  });
});
