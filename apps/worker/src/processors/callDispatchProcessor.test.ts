import { afterAll, afterEach, describe, expect, it } from "vitest";
import { prisma } from "@lynkro-outbound/db";
import { resetTestDatabase, seedOrganizationFixture } from "@lynkro-outbound/db/test-utils";
import { CALL_OUTCOMES } from "@lynkro-outbound/shared";
import { processCallDispatch } from "./callDispatchProcessor.js";

afterEach(async () => {
  await resetTestDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function createQueuedCall(organizationId: string, campaignId: string, phone: string) {
  const prospect = await prisma.prospect.create({
    data: {
      organizationId,
      campaignId,
      name: "Prospecto worker",
      phoneE164: phone,
      timezone: "America/Bogota",
      intent: "test",
      desiredOutcome: "test",
      source: "test",
      consentGiven: true,
      status: "queued",
    },
  });
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  const call = await prisma.call.create({
    data: {
      organizationId,
      campaignId,
      prospectId: prospect.id,
      phoneNumberId: campaign.outboundPhoneNumberId,
      status: "queued",
      attemptNumber: 1,
      simulation: true,
    },
  });
  return { prospect, call };
}

describe("processCallDispatch", () => {
  it("ejecuta una llamada simulada de punta a punta y produce un resultado estructurado válido", async () => {
    const org = await seedOrganizationFixture(prisma, "Dispatch1");
    const { call } = await createQueuedCall(org.organizationId, org.campaignId, "+14155552001");

    await processCallDispatch({ callId: call.id, organizationId: org.organizationId, reason: "manual" });

    const finalCall = await prisma.call.findUniqueOrThrow({ where: { id: call.id } });
    expect(finalCall.status).toBe("completed");
    expect(finalCall.outcome).not.toBeNull();
    expect(CALL_OUTCOMES).toContain(finalCall.outcome);
  });

  it("rechaza el despacho si el prospecto pasó a Do Not Call después de encolar la llamada (re-chequeo de elegibilidad)", async () => {
    const org = await seedOrganizationFixture(prisma, "Dispatch2");
    const { prospect, call } = await createQueuedCall(org.organizationId, org.campaignId, "+14155552002");

    await prisma.doNotCall.create({
      data: { organizationId: org.organizationId, phoneE164: prospect.phoneE164, reason: "solicitud tardía" },
    });

    await processCallDispatch({ callId: call.id, organizationId: org.organizationId, reason: "manual" });

    const finalCall = await prisma.call.findUniqueOrThrow({ where: { id: call.id } });
    expect(finalCall.status).toBe("eligibility_failed");
    expect(finalCall.eligibilityRejectionReason).toBe("DO_NOT_CALL_LISTED");
  });

  it("no hace nada si la llamada ya no está en estado queued (evita doble procesamiento)", async () => {
    const org = await seedOrganizationFixture(prisma, "Dispatch3");
    const { call } = await createQueuedCall(org.organizationId, org.campaignId, "+14155552003");
    await prisma.call.update({ where: { id: call.id }, data: { status: "canceled" } });

    await processCallDispatch({ callId: call.id, organizationId: org.organizationId, reason: "manual" });

    const finalCall = await prisma.call.findUniqueOrThrow({ where: { id: call.id } });
    expect(finalCall.status).toBe("canceled");
  });
});
