import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "@lynkro-outbound/db";
import { buildTestApp, resetDatabase } from "../testHelpers.js";

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

function extractCookie(setCookieHeader: string | string[] | undefined): string {
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  return raw?.split(";")[0] ?? "";
}

async function registerAndGetCookie(email: string) {
  const response = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { organizationName: `Org ${email}`, email, password: "SuperSecreta!2026" },
  });
  return { cookie: extractCookie(response.headers["set-cookie"]), organizationId: response.json().organizationId };
}

async function createPhoneAndAgent(organizationId: string) {
  const phoneNumber = await prisma.phoneNumber.create({
    data: { organizationId, e164: "+15005550401", label: "Test" },
  });
  const voiceAgent = await prisma.voiceAgent.create({
    data: { organizationId, name: "Agente", persona: "Test", systemPromptTemplate: "default_v1" },
  });
  return { phoneNumber, voiceAgent };
}

describe("campaign routes: llamada de prueba", () => {
  it("dispara una llamada de prueba aunque la campaña esté en borrador (sin activar)", async () => {
    const { cookie, organizationId } = await registerAndGetCookie("campaign-test-call@test.com");
    const { phoneNumber, voiceAgent } = await createPhoneAndAgent(organizationId);

    const campaignResponse = await app.inject({
      method: "POST",
      url: "/campaigns",
      headers: { cookie },
      payload: {
        name: "Campaña sin lanzar",
        language: "es",
        objective: "Objetivo",
        allowedWindow: { start: "09:00", end: "18:00" },
        timezoneDefault: "America/Bogota",
        outboundPhoneNumberId: phoneNumber.id,
        maxAttempts: 3,
        attemptIntervalMinutes: 60,
        voiceAgentId: voiceAgent.id,
        agentInstructions: "Instrucciones",
      },
    });
    const campaignId = campaignResponse.json().campaign.id;
    expect(campaignResponse.json().campaign.status).toBe("draft");

    const testCallResponse = await app.inject({
      method: "POST",
      url: `/campaigns/${campaignId}/test-call`,
      headers: { cookie },
      payload: { phone: "+14155550111" },
    });
    expect(testCallResponse.statusCode).toBe(202);
    const call = testCallResponse.json().call;
    expect(call.isTest).toBe(true);

    const prospect = await prisma.prospect.findUniqueOrThrow({ where: { id: call.prospectId } });
    expect(prospect.isTest).toBe(true);
    expect(prospect.consentGiven).toBe(true);
  });

  it("no muestra el prospecto sintético de la llamada de prueba en /prospects", async () => {
    const { cookie, organizationId } = await registerAndGetCookie("campaign-test-call-hidden@test.com");
    const { phoneNumber, voiceAgent } = await createPhoneAndAgent(organizationId);
    const campaignResponse = await app.inject({
      method: "POST",
      url: "/campaigns",
      headers: { cookie },
      payload: {
        name: "Campaña",
        language: "es",
        objective: "Objetivo",
        allowedWindow: { start: "09:00", end: "18:00" },
        timezoneDefault: "America/Bogota",
        outboundPhoneNumberId: phoneNumber.id,
        maxAttempts: 3,
        attemptIntervalMinutes: 60,
        voiceAgentId: voiceAgent.id,
        agentInstructions: "Instrucciones",
      },
    });
    const campaignId = campaignResponse.json().campaign.id;

    await app.inject({
      method: "POST",
      url: `/campaigns/${campaignId}/test-call`,
      headers: { cookie },
      payload: { phone: "+14155550112" },
    });

    const list = await app.inject({ method: "GET", url: "/prospects", headers: { cookie } });
    expect(list.json().prospects).toHaveLength(0);
  });

  it("permite repetir una llamada de prueba al mismo número sin romper por prospecto duplicado", async () => {
    const { cookie, organizationId } = await registerAndGetCookie("campaign-test-call-repeat@test.com");
    const { phoneNumber, voiceAgent } = await createPhoneAndAgent(organizationId);
    const campaignResponse = await app.inject({
      method: "POST",
      url: "/campaigns",
      headers: { cookie },
      payload: {
        name: "Campaña",
        language: "es",
        objective: "Objetivo",
        allowedWindow: { start: "09:00", end: "18:00" },
        timezoneDefault: "America/Bogota",
        outboundPhoneNumberId: phoneNumber.id,
        maxAttempts: 3,
        attemptIntervalMinutes: 60,
        voiceAgentId: voiceAgent.id,
        agentInstructions: "Instrucciones",
      },
    });
    const campaignId = campaignResponse.json().campaign.id;

    const first = await app.inject({
      method: "POST",
      url: `/campaigns/${campaignId}/test-call`,
      headers: { cookie },
      payload: { phone: "+14155550113" },
    });
    const second = await app.inject({
      method: "POST",
      url: `/campaigns/${campaignId}/test-call`,
      headers: { cookie },
      payload: { phone: "+14155550113" },
    });

    expect(first.statusCode).toBe(202);
    expect(second.statusCode).toBe(202);
    // Mismo prospecto reutilizado, no un P2002 por (organizationId, phoneE164) duplicado.
    expect(second.json().call.prospectId).toBe(first.json().call.prospectId);
  });

  it("prueba una campaña con el número de un prospecto real sin modificarlo", async () => {
    const { cookie, organizationId } = await registerAndGetCookie("campaign-test-call-real-prospect@test.com");
    const { phoneNumber, voiceAgent } = await createPhoneAndAgent(organizationId);
    const campaignResponse = await app.inject({
      method: "POST",
      url: "/campaigns",
      headers: { cookie },
      payload: {
        name: "Campaña",
        language: "es",
        objective: "Objetivo",
        allowedWindow: { start: "09:00", end: "18:00" },
        timezoneDefault: "America/Bogota",
        outboundPhoneNumberId: phoneNumber.id,
        maxAttempts: 3,
        attemptIntervalMinutes: 60,
        voiceAgentId: voiceAgent.id,
        agentInstructions: "Instrucciones",
      },
    });
    const campaignId = campaignResponse.json().campaign.id;

    const realProspect = await prisma.prospect.create({
      data: {
        organizationId,
        campaignId,
        name: "Prospecto real",
        phoneE164: "+14155550114",
        language: "es",
        timezone: "America/Bogota",
        intent: "Intención real",
        desiredOutcome: "Resultado real",
        source: "csv",
        consentGiven: false,
        status: "new",
      },
    });

    const testCallResponse = await app.inject({
      method: "POST",
      url: `/campaigns/${campaignId}/test-call`,
      headers: { cookie },
      payload: { phone: "+14155550114" },
    });

    expect(testCallResponse.statusCode).toBe(202);
    expect(testCallResponse.json().call.prospectId).toBe(realProspect.id);

    const untouched = await prisma.prospect.findUniqueOrThrow({ where: { id: realProspect.id } });
    expect(untouched.isTest).toBe(false);
    expect(untouched.consentGiven).toBe(false);
    expect(untouched.name).toBe("Prospecto real");
  });
});
