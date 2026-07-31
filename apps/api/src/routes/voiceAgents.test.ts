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

    const stillThere = await prisma.voiceAgent.findUnique({ where: { id: voiceAgentId } });
    expect(stillThere).not.toBeNull();
  });
});
