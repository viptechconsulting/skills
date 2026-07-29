import { afterAll, afterEach, describe, expect, it } from "vitest";
import "./testSetup.js";
import { prisma } from "@lynkro-outbound/db";
import { resetTestDatabase, seedOrganizationFixture } from "@lynkro-outbound/db/test-utils";
import { scheduleNextAttemptIfNeeded } from "./retrySchedulingService.js";

afterEach(async () => {
  await resetTestDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function createProspectWithRetryPolicy(
  label: string,
  overrides: { maxAttempts?: number } = {},
) {
  const org = await seedOrganizationFixture(prisma, label);
  await prisma.retryPolicy.create({
    data: {
      campaignId: org.campaignId,
      reason: "no_answer",
      maxAttempts: overrides.maxAttempts ?? 3,
      intervalMinutes: 60,
      spreadAcrossDayparts: false,
    },
  });
  const prospect = await prisma.prospect.create({
    data: {
      organizationId: org.organizationId,
      campaignId: org.campaignId,
      name: "Prospecto retry",
      phoneE164: "+14155554321",
      timezone: "America/Bogota",
      intent: "test",
      desiredOutcome: "test",
      source: "test",
      status: "in_progress",
    },
  });
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: org.campaignId } });
  return { org, prospect, campaign };
}

async function createCall(organizationId: string, campaignId: string, prospectId: string, phoneNumberId: string) {
  return prisma.call.create({
    data: {
      organizationId,
      campaignId,
      prospectId,
      phoneNumberId,
      status: "completed",
      attemptNumber: 1,
      endedAt: new Date(),
    },
  });
}

describe("scheduleNextAttemptIfNeeded", () => {
  it("programa un reintento y marca al prospecto como 'scheduled' ante NO_ANSWER", async () => {
    const { org, prospect, campaign } = await createProspectWithRetryPolicy("Retry1");
    const call = await createCall(org.organizationId, org.campaignId, prospect.id, campaign.outboundPhoneNumberId);
    await prisma.call.update({ where: { id: call.id }, data: { outcome: "NO_ANSWER" } });

    await scheduleNextAttemptIfNeeded(org.organizationId, call.id);

    const updated = await prisma.prospect.findUniqueOrThrow({ where: { id: prospect.id } });
    expect(updated.status).toBe("scheduled");
    expect(updated.nextAttemptAt).not.toBeNull();
    expect(updated.attemptCount).toBe(1);
  });

  it("marca al prospecto como 'completed' ante un resultado no reintentable (QUALIFIED_NOT_BOOKED)", async () => {
    const { org, prospect, campaign } = await createProspectWithRetryPolicy("Retry2");
    const call = await createCall(org.organizationId, org.campaignId, prospect.id, campaign.outboundPhoneNumberId);
    await prisma.call.update({ where: { id: call.id }, data: { outcome: "QUALIFIED_NOT_BOOKED" } });

    await scheduleNextAttemptIfNeeded(org.organizationId, call.id);

    const updated = await prisma.prospect.findUniqueOrThrow({ where: { id: prospect.id } });
    expect(updated.status).toBe("completed");
    expect(updated.nextAttemptAt).toBeNull();
    expect(updated.attemptCount).toBe(1);
  });

  it("marca al prospecto como 'completed' al alcanzar el máximo de intentos de la política", async () => {
    const { org, prospect, campaign } = await createProspectWithRetryPolicy("Retry3", { maxAttempts: 1 });
    await prisma.prospect.update({ where: { id: prospect.id }, data: { attemptCount: 1 } });
    const call = await createCall(org.organizationId, org.campaignId, prospect.id, campaign.outboundPhoneNumberId);
    await prisma.call.update({ where: { id: call.id }, data: { outcome: "NO_ANSWER" } });

    await scheduleNextAttemptIfNeeded(org.organizationId, call.id);

    const updated = await prisma.prospect.findUniqueOrThrow({ where: { id: prospect.id } });
    expect(updated.status).toBe("completed");
    expect(updated.attemptCount).toBe(2);
  });

  it("nunca sobrescribe el estado de un prospecto ya marcado como do_not_call", async () => {
    const { org, prospect, campaign } = await createProspectWithRetryPolicy("Retry4");
    await prisma.prospect.update({ where: { id: prospect.id }, data: { status: "do_not_call", isBlocked: true } });
    const call = await createCall(org.organizationId, org.campaignId, prospect.id, campaign.outboundPhoneNumberId);
    await prisma.call.update({ where: { id: call.id }, data: { outcome: "DO_NOT_CALL" } });

    await scheduleNextAttemptIfNeeded(org.organizationId, call.id);

    const updated = await prisma.prospect.findUniqueOrThrow({ where: { id: prospect.id } });
    expect(updated.status).toBe("do_not_call");
    expect(updated.attemptCount).toBe(1);
  });

  it("detiene los reintentos ante WRONG_NUMBER", async () => {
    const { org, prospect, campaign } = await createProspectWithRetryPolicy("Retry5");
    const call = await createCall(org.organizationId, org.campaignId, prospect.id, campaign.outboundPhoneNumberId);
    await prisma.call.update({ where: { id: call.id }, data: { outcome: "WRONG_NUMBER" } });

    await scheduleNextAttemptIfNeeded(org.organizationId, call.id);

    const updated = await prisma.prospect.findUniqueOrThrow({ where: { id: prospect.id } });
    expect(updated.status).toBe("completed");
    expect(updated.nextAttemptAt).toBeNull();
  });
});
