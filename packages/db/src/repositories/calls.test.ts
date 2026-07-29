import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildIdempotencyKey } from "@lynkro-outbound/shared";
import { createTestPrismaClient, resetTestDatabase, seedOrganizationFixture } from "../testUtils.js";
import { recordCallEventIdempotent } from "./calls.js";

const db = createTestPrismaClient();

beforeEach(async () => {
  await resetTestDatabase(db);
});

afterAll(async () => {
  await db.$disconnect();
});

async function createTestCall(organizationId: string, campaignId: string) {
  const prospect = await db.prospect.create({
    data: {
      organizationId,
      campaignId,
      name: "Prospecto de prueba",
      phoneE164: "+14155550077",
      timezone: "America/Bogota",
      intent: "test",
      desiredOutcome: "test",
      source: "test",
    },
  });
  const campaign = await db.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  return db.call.create({
    data: {
      organizationId,
      campaignId,
      prospectId: prospect.id,
      phoneNumberId: campaign.outboundPhoneNumberId,
      status: "ringing",
      attemptNumber: 1,
      simulation: true,
    },
  });
}

describe("idempotencia de eventos de llamada (webhooks)", () => {
  it("un mismo evento de webhook procesado dos veces solo crea un CallEvent", async () => {
    const org = await seedOrganizationFixture(db, "Idem");
    const call = await createTestCall(org.organizationId, org.campaignId);

    const idempotencyKey = buildIdempotencyKey("CAxxxx", "in-progress", "1");

    const first = await recordCallEventIdempotent(db, {
      callId: call.id,
      type: "twilio.voice-status",
      payload: { CallStatus: "in-progress" },
      causedBy: "twilio-webhook",
      idempotencyKey,
    });
    const second = await recordCallEventIdempotent(db, {
      callId: call.id,
      type: "twilio.voice-status",
      payload: { CallStatus: "in-progress" },
      causedBy: "twilio-webhook",
      idempotencyKey,
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.event.id).toBe(first.event.id);

    const events = await db.callEvent.findMany({ where: { callId: call.id } });
    expect(events).toHaveLength(1);
  });

  it("dos claves de idempotencia distintas producen dos eventos", async () => {
    const org = await seedOrganizationFixture(db, "Idem2");
    const call = await createTestCall(org.organizationId, org.campaignId);

    await recordCallEventIdempotent(db, {
      callId: call.id,
      type: "twilio.voice-status",
      payload: { CallStatus: "ringing" },
      causedBy: "twilio-webhook",
      idempotencyKey: buildIdempotencyKey("CAxxxx", "ringing", "1"),
    });
    await recordCallEventIdempotent(db, {
      callId: call.id,
      type: "twilio.voice-status",
      payload: { CallStatus: "in-progress" },
      causedBy: "twilio-webhook",
      idempotencyKey: buildIdempotencyKey("CAxxxx", "in-progress", "2"),
    });

    const events = await db.callEvent.findMany({ where: { callId: call.id } });
    expect(events).toHaveLength(2);
  });
});
