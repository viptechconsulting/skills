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

describe("voice agent routes", () => {
  it("crea un agente de voz con persona y tono, y lo lista", async () => {
    const { cookie } = await registerAndGetCookie("va-create@test.com");

    const created = await app.inject({
      method: "POST",
      url: "/voice-agents",
      headers: { cookie },
      payload: { name: "Sofía", persona: "Cercana y profesional", tone: "Cálido, ritmo pausado" },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().voiceAgent.tone).toBe("Cálido, ritmo pausado");

    const list = await app.inject({ method: "GET", url: "/voice-agents", headers: { cookie } });
    expect(list.json().voiceAgents).toHaveLength(1);
  });

  it("actualiza nombre, persona, tono y voz de un agente existente", async () => {
    const { cookie } = await registerAndGetCookie("va-update@test.com");
    const created = await app.inject({
      method: "POST",
      url: "/voice-agents",
      headers: { cookie },
      payload: { name: "Sofía", persona: "Cercana" },
    });
    const id = created.json().voiceAgent.id;

    const updated = await app.inject({
      method: "PATCH",
      url: `/voice-agents/${id}`,
      headers: { cookie },
      payload: { name: "Sofía v2", tone: "Directo y enérgico", voice: "verse" },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().voiceAgent).toMatchObject({ name: "Sofía v2", tone: "Directo y enérgico", voice: "verse" });
  });

  it("elimina un agente de voz que no está en uso", async () => {
    const { cookie } = await registerAndGetCookie("va-delete@test.com");
    const created = await app.inject({
      method: "POST",
      url: "/voice-agents",
      headers: { cookie },
      payload: { name: "Descartable", persona: "Test" },
    });
    const id = created.json().voiceAgent.id;

    const deleted = await app.inject({ method: "DELETE", url: `/voice-agents/${id}`, headers: { cookie } });
    expect(deleted.statusCode).toBe(200);

    const list = await app.inject({ method: "GET", url: "/voice-agents", headers: { cookie } });
    expect(list.json().voiceAgents).toHaveLength(0);
  });

  it("rechaza eliminar un agente de voz usado por una campaña (409) sin romper el resto", async () => {
    const { cookie, organizationId } = await registerAndGetCookie("va-delete-blocked@test.com");
    const voiceAgent = await app.inject({
      method: "POST",
      url: "/voice-agents",
      headers: { cookie },
      payload: { name: "En uso", persona: "Test" },
    });
    const voiceAgentId = voiceAgent.json().voiceAgent.id;
    const phoneNumber = await prisma.phoneNumber.create({
      data: { organizationId, e164: "+15005550301", label: "Test" },
    });

    await app.inject({
      method: "POST",
      url: "/campaigns",
      headers: { cookie },
      payload: {
        name: "Campaña",
        language: "es",
        objective: "Objetivo",
        allowedWindow: { start: "00:00", end: "00:00" },
        timezoneDefault: "America/Bogota",
        outboundPhoneNumberId: phoneNumber.id,
        maxAttempts: 3,
        attemptIntervalMinutes: 60,
        voiceAgentId,
        agentInstructions: "Instrucciones",
      },
    });

    const deleted = await app.inject({ method: "DELETE", url: `/voice-agents/${voiceAgentId}`, headers: { cookie } });
    expect(deleted.statusCode).toBe(409);
    expect(deleted.json().error).toBe("VOICE_AGENT_IN_USE");
    expect(deleted.json().campaigns).toEqual([{ id: expect.any(String), name: "Campaña" }]);

    const stillThere = await prisma.voiceAgent.findUnique({ where: { id: voiceAgentId } });
    expect(stillThere).not.toBeNull();
  });

  it("reasigna las campañas dependientes a otro agente y elimina el original", async () => {
    const { cookie, organizationId } = await registerAndGetCookie("va-reassign@test.com");
    const oldAgent = await app.inject({
      method: "POST",
      url: "/voice-agents",
      headers: { cookie },
      payload: { name: "Viejo", persona: "Test" },
    });
    const oldAgentId = oldAgent.json().voiceAgent.id;
    const newAgent = await app.inject({
      method: "POST",
      url: "/voice-agents",
      headers: { cookie },
      payload: { name: "Nuevo", persona: "Test" },
    });
    const newAgentId = newAgent.json().voiceAgent.id;
    const phoneNumber = await prisma.phoneNumber.create({
      data: { organizationId, e164: "+15005550302", label: "Test" },
    });

    const campaignResponse = await app.inject({
      method: "POST",
      url: "/campaigns",
      headers: { cookie },
      payload: {
        name: "Campaña dependiente",
        language: "es",
        objective: "Objetivo",
        allowedWindow: { start: "00:00", end: "00:00" },
        timezoneDefault: "America/Bogota",
        outboundPhoneNumberId: phoneNumber.id,
        maxAttempts: 3,
        attemptIntervalMinutes: 60,
        voiceAgentId: oldAgentId,
        agentInstructions: "Instrucciones",
      },
    });
    const campaignId = campaignResponse.json().campaign.id;

    const deleted = await app.inject({
      method: "DELETE",
      url: `/voice-agents/${oldAgentId}?reassignTo=${newAgentId}`,
      headers: { cookie },
    });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json().reassignedCampaigns).toBe(1);

    const gone = await prisma.voiceAgent.findUnique({ where: { id: oldAgentId } });
    expect(gone).toBeNull();

    const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    expect(campaign.voiceAgentId).toBe(newAgentId);
  });

  it("rechaza reasignar a un agente de reemplazo inexistente", async () => {
    const { cookie, organizationId } = await registerAndGetCookie("va-reassign-invalid@test.com");
    const oldAgent = await app.inject({
      method: "POST",
      url: "/voice-agents",
      headers: { cookie },
      payload: { name: "Viejo", persona: "Test" },
    });
    const oldAgentId = oldAgent.json().voiceAgent.id;
    const phoneNumber = await prisma.phoneNumber.create({
      data: { organizationId, e164: "+15005550303", label: "Test" },
    });
    await app.inject({
      method: "POST",
      url: "/campaigns",
      headers: { cookie },
      payload: {
        name: "Campaña",
        language: "es",
        objective: "Objetivo",
        allowedWindow: { start: "00:00", end: "00:00" },
        timezoneDefault: "America/Bogota",
        outboundPhoneNumberId: phoneNumber.id,
        maxAttempts: 3,
        attemptIntervalMinutes: 60,
        voiceAgentId: oldAgentId,
        agentInstructions: "Instrucciones",
      },
    });

    const deleted = await app.inject({
      method: "DELETE",
      url: `/voice-agents/${oldAgentId}?reassignTo=00000000-0000-0000-0000-000000000099`,
      headers: { cookie },
    });
    expect(deleted.statusCode).toBe(400);
    expect(deleted.json().error).toBe("REASSIGN_TARGET_NOT_FOUND");

    const stillThere = await prisma.voiceAgent.findUnique({ where: { id: oldAgentId } });
    expect(stillThere).not.toBeNull();
  });

  it("prueba un agente de voz suelto creando una campaña sandbox oculta, reutilizada entre pruebas", async () => {
    const { cookie, organizationId } = await registerAndGetCookie("va-test-call@test.com");
    const phoneNumber = await prisma.phoneNumber.create({
      data: { organizationId, e164: "+15005550401", label: "Test" },
    });
    const agentA = await app.inject({
      method: "POST",
      url: "/voice-agents",
      headers: { cookie },
      payload: { name: "Agente A", persona: "Test", tone: "Cálido" },
    });
    const agentAId = agentA.json().voiceAgent.id;

    const firstCall = await app.inject({
      method: "POST",
      url: `/voice-agents/${agentAId}/test-call`,
      headers: { cookie },
      payload: { phone: "+14155550121", outboundPhoneNumberId: phoneNumber.id },
    });
    expect(firstCall.statusCode).toBe(202);
    expect(firstCall.json().call.isTest).toBe(true);

    const sandboxCampaigns = await prisma.campaign.findMany({ where: { organizationId, isTest: true } });
    expect(sandboxCampaigns).toHaveLength(1);
    expect(sandboxCampaigns[0]?.voiceAgentId).toBe(agentAId);

    // La campaña sandbox nunca debe aparecer en el listado de campañas real.
    const campaignsList = await app.inject({ method: "GET", url: "/campaigns", headers: { cookie } });
    expect(campaignsList.json().campaigns).toHaveLength(0);

    const agentB = await app.inject({
      method: "POST",
      url: "/voice-agents",
      headers: { cookie },
      payload: { name: "Agente B", persona: "Test", tone: "Directo" },
    });
    const agentBId = agentB.json().voiceAgent.id;

    const secondCall = await app.inject({
      method: "POST",
      url: `/voice-agents/${agentBId}/test-call`,
      headers: { cookie },
      payload: { phone: "+14155550122", outboundPhoneNumberId: phoneNumber.id },
    });
    expect(secondCall.statusCode).toBe(202);

    // Sigue habiendo una sola campaña sandbox, reutilizada, ahora apuntando al agente B.
    const sandboxAfter = await prisma.campaign.findMany({ where: { organizationId, isTest: true } });
    expect(sandboxAfter).toHaveLength(1);
    expect(sandboxAfter[0]?.id).toBe(sandboxCampaigns[0]?.id);
    expect(sandboxAfter[0]?.voiceAgentId).toBe(agentBId);
  });

  it("permite borrar un agente que la sandbox usó por última vez, reasignándola a otro agente", async () => {
    const { cookie, organizationId } = await registerAndGetCookie("va-test-call-delete@test.com");
    const phoneNumber = await prisma.phoneNumber.create({
      data: { organizationId, e164: "+15005550402", label: "Test" },
    });
    const agentA = await app.inject({
      method: "POST",
      url: "/voice-agents",
      headers: { cookie },
      payload: { name: "Agente A", persona: "Test" },
    });
    const agentAId = agentA.json().voiceAgent.id;
    await app.inject({
      method: "POST",
      url: "/voice-agents",
      headers: { cookie },
      payload: { name: "Agente B", persona: "Test" },
    });

    await app.inject({
      method: "POST",
      url: `/voice-agents/${agentAId}/test-call`,
      headers: { cookie },
      payload: { phone: "+14155550123", outboundPhoneNumberId: phoneNumber.id },
    });

    // Nada de esto es una campaña "real" — borrar el agente A no debería
    // bloquearse por la sandbox que lo usó por última vez.
    const deleted = await app.inject({ method: "DELETE", url: `/voice-agents/${agentAId}`, headers: { cookie } });
    expect(deleted.statusCode).toBe(200);

    const sandbox = await prisma.campaign.findFirstOrThrow({ where: { organizationId, isTest: true } });
    expect(sandbox.voiceAgentId).not.toBe(agentAId);
  });
});
