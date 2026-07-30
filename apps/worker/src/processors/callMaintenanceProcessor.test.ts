import { afterAll, afterEach, describe, expect, it } from "vitest";
import { prisma } from "@lynkro-outbound/db";
import { resetTestDatabase, seedOrganizationFixture } from "@lynkro-outbound/db/test-utils";
import { processCallMaintenance } from "./callMaintenanceProcessor.js";

afterEach(async () => {
  await resetTestDatabase(prisma);
  await prisma.call.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("processCallMaintenance", () => {
  it("encola una llamada para un prospecto programado cuyo nextAttemptAt ya venció", async () => {
    const org = await seedOrganizationFixture(prisma, "Maint1");
    await prisma.prospect.create({
      data: {
        organizationId: org.organizationId,
        campaignId: org.campaignId,
        name: "Prospecto vencido",
        phoneE164: "+14155553001",
        timezone: "America/Bogota",
        intent: "test",
        desiredOutcome: "test",
        source: "test",
        consentGiven: true,
        status: "scheduled",
        nextAttemptAt: new Date(Date.now() - 60_000),
      },
    });

    const result = await processCallMaintenance();

    expect(result.scanned).toBeGreaterThanOrEqual(1);
    expect(result.enqueued).toBeGreaterThanOrEqual(1);

    const call = await prisma.call.findFirst({ where: { organizationId: org.organizationId } });
    expect(call).not.toBeNull();
    expect(call?.status).toBe("queued");
  });

  it("no encola un prospecto en la lista Do Not Call aunque su horario ya venció", async () => {
    const org = await seedOrganizationFixture(prisma, "Maint2");
    const phone = "+14155553002";
    await prisma.doNotCall.create({ data: { organizationId: org.organizationId, phoneE164: phone, reason: "dnc" } });
    await prisma.prospect.create({
      data: {
        organizationId: org.organizationId,
        campaignId: org.campaignId,
        name: "Prospecto DNC",
        phoneE164: phone,
        timezone: "America/Bogota",
        intent: "test",
        desiredOutcome: "test",
        source: "test",
        consentGiven: true,
        status: "scheduled",
        nextAttemptAt: new Date(Date.now() - 60_000),
      },
    });

    const result = await processCallMaintenance();

    const call = await prisma.call.findFirst({ where: { organizationId: org.organizationId } });
    expect(call).toBeNull();
    expect(result.enqueued).toBe(0);
  });

  it("encola un prospecto nuevo recién asignado a una campaña aunque no tenga nextAttemptAt (import masivo)", async () => {
    const org = await seedOrganizationFixture(prisma, "Maint4");
    await prisma.prospect.create({
      data: {
        organizationId: org.organizationId,
        campaignId: org.campaignId,
        name: "Prospecto importado",
        phoneE164: "+14155553004",
        timezone: "America/Bogota",
        intent: "test",
        desiredOutcome: "test",
        source: "test",
        consentGiven: true,
        status: "new",
        nextAttemptAt: null,
      },
    });

    const result = await processCallMaintenance();

    expect(result.enqueued).toBeGreaterThanOrEqual(1);
    const call = await prisma.call.findFirst({ where: { organizationId: org.organizationId } });
    expect(call).not.toBeNull();
    expect(call?.status).toBe("queued");
  });

  it("no encola un prospecto cuyo nextAttemptAt aún no vence", async () => {
    const org = await seedOrganizationFixture(prisma, "Maint3");
    await prisma.prospect.create({
      data: {
        organizationId: org.organizationId,
        campaignId: org.campaignId,
        name: "Prospecto futuro",
        phoneE164: "+14155553003",
        timezone: "America/Bogota",
        intent: "test",
        desiredOutcome: "test",
        source: "test",
        consentGiven: true,
        status: "scheduled",
        nextAttemptAt: new Date(Date.now() + 60 * 60_000),
      },
    });

    const result = await processCallMaintenance();
    const call = await prisma.call.findFirst({ where: { organizationId: org.organizationId } });
    expect(call).toBeNull();
    expect(result.enqueued).toBe(0);
  });
});
