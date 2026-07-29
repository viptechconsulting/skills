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

describe("auth flow", () => {
  it("registra, inicia sesión, consulta /auth/me y cierra sesión", async () => {
    const registerResponse = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        organizationName: "Acme Corp",
        email: "owner@acme.test",
        password: "SuperSecreta!2026",
      },
    });
    expect(registerResponse.statusCode).toBe(201);
    const cookie = extractCookie(registerResponse.headers["set-cookie"]);
    expect(cookie).toContain("=");

    const meResponse = await app.inject({ method: "GET", url: "/auth/me", headers: { cookie } });
    expect(meResponse.statusCode).toBe(200);
    expect(meResponse.json().email).toBe("owner@acme.test");

    const logoutResponse = await app.inject({ method: "POST", url: "/auth/logout", headers: { cookie } });
    expect(logoutResponse.statusCode).toBe(200);
  });

  it("rechaza login con credenciales inválidas", async () => {
    await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { organizationName: "Acme", email: "user2@acme.test", password: "SuperSecreta!2026" },
    });

    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "user2@acme.test", password: "ContraseñaIncorrecta!" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("rechaza acceso a rutas protegidas sin sesión", async () => {
    const response = await app.inject({ method: "GET", url: "/campaigns" });
    expect(response.statusCode).toBe(401);
  });

  it("aisla campañas entre organizaciones distintas", async () => {
    const regA = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { organizationName: "Org A", email: "a@test.com", password: "SuperSecreta!2026" },
    });
    const cookieA = extractCookie(regA.headers["set-cookie"]);

    const regB = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { organizationName: "Org B", email: "b@test.com", password: "SuperSecreta!2026" },
    });
    const cookieB = extractCookie(regB.headers["set-cookie"]);

    const phoneNumber = await prisma.phoneNumber.create({
      data: { organizationId: regA.json().organizationId, e164: "+15005550100", label: "Test" },
    });
    const voiceAgent = await prisma.voiceAgent.create({
      data: {
        organizationId: regA.json().organizationId,
        name: "Agente",
        persona: "Test",
        systemPromptTemplate: "default_v1",
      },
    });

    const createCampaignResponse = await app.inject({
      method: "POST",
      url: "/campaigns",
      headers: { cookie: cookieA },
      payload: {
        name: "Campaña A",
        language: "es",
        objective: "Objetivo",
        allowedWindow: { start: "09:00", end: "19:00" },
        timezoneDefault: "America/Bogota",
        outboundPhoneNumberId: phoneNumber.id,
        maxAttempts: 3,
        attemptIntervalMinutes: 60,
        voiceAgentId: voiceAgent.id,
        agentInstructions: "Instrucciones",
      },
    });
    expect(createCampaignResponse.statusCode).toBe(201);

    const listAsOrgA = await app.inject({ method: "GET", url: "/campaigns", headers: { cookie: cookieA } });
    const listAsOrgB = await app.inject({ method: "GET", url: "/campaigns", headers: { cookie: cookieB } });

    expect(listAsOrgA.json().campaigns).toHaveLength(1);
    expect(listAsOrgB.json().campaigns).toHaveLength(0);
  });
});
