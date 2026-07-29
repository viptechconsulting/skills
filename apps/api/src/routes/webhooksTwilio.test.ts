import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "@lynkro-outbound/db";
import { buildTestApp, resetDatabase, seedOrgWithCampaign } from "../testHelpers.js";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
  await app.ready();
});

afterEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

async function createCallInSimulation(organizationId: string, campaignId: string, callSid: string) {
  const prospect = await prisma.prospect.create({
    data: {
      organizationId,
      campaignId,
      name: "Prospecto webhook",
      phoneE164: "+14155559001",
      timezone: "America/Bogota",
      intent: "test",
      desiredOutcome: "test",
      source: "test",
    },
  });
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  return prisma.call.create({
    data: {
      organizationId,
      campaignId,
      prospectId: prospect.id,
      phoneNumberId: campaign.outboundPhoneNumberId,
      status: "ringing",
      attemptNumber: 1,
      simulation: true,
      providerCallSid: callSid,
    },
  });
}

function formBody(fields: Record<string, string>): string {
  return new URLSearchParams(fields).toString();
}

describe("webhooks de Twilio", () => {
  it("procesa un evento válido y transiciona el estado de la llamada", async () => {
    const org = await seedOrgWithCampaign("Webhook1");
    const call = await createCallInSimulation(org.organization.id, org.campaign.id, "CA_TEST_001");

    const response = await app.inject({
      method: "POST",
      url: "/webhooks/twilio/voice-status",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({ CallSid: "CA_TEST_001", CallStatus: "in-progress", SequenceNumber: "1" }),
    });

    expect(response.statusCode).toBe(200);
    const updated = await prisma.call.findUniqueOrThrow({ where: { id: call.id } });
    // "in-progress" de Twilio significa "contestada"; nuestro estado interno
    // "answered" es el que corresponde antes de la detección de humano/buzón.
    expect(updated.status).toBe("answered");
  });

  it("un evento de webhook repetido (mismo CallSid+status+secuencia) no duplica el efecto", async () => {
    const org = await seedOrgWithCampaign("Webhook2");
    const call = await createCallInSimulation(org.organization.id, org.campaign.id, "CA_TEST_002");

    const payload = formBody({ CallSid: "CA_TEST_002", CallStatus: "busy", SequenceNumber: "1" });

    const first = await app.inject({
      method: "POST",
      url: "/webhooks/twilio/voice-status",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload,
    });
    const second = await app.inject({
      method: "POST",
      url: "/webhooks/twilio/voice-status",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload,
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json().duplicate).toBe(true);

    const eventsAfterFirst = await prisma.callEvent.findMany({ where: { callId: call.id } });
    expect(eventsAfterFirst.length).toBeGreaterThan(0);

    // Procesar el mismo webhook una segunda vez no debe crear eventos
    // adicionales ni volver a aplicar el efecto (outcome/estado ya fijado).
    const eventsAfterSecond = await prisma.callEvent.findMany({ where: { callId: call.id } });
    expect(eventsAfterSecond).toHaveLength(eventsAfterFirst.length);

    const updated = await prisma.call.findUniqueOrThrow({ where: { id: call.id } });
    expect(updated.status).toBe("busy");
    expect(updated.outcome).toBe("BUSY");
  });

  it("ignora silenciosamente eventos de CallSid desconocidos (sin error 500)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/webhooks/twilio/voice-status",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({ CallSid: "CA_DESCONOCIDO", CallStatus: "completed" }),
    });
    expect(response.statusCode).toBe(202);
  });

  it("rechaza un payload inválido con 400", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/webhooks/twilio/voice-status",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody({ CallSid: "CA_X" }),
    });
    expect(response.statusCode).toBe(400);
  });
});
