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

async function registerOwner(email: string) {
  const response = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { organizationName: `Org ${email}`, email, password: "SuperSecreta!2026" },
  });
  return { cookie: extractCookie(response.headers["set-cookie"]), organizationId: response.json().organizationId };
}

describe("organization routes", () => {
  it("permite al owner actualizar la configuración de la organización", async () => {
    const { cookie } = await registerOwner("owner-settings@test.com");

    const response = await app.inject({
      method: "PATCH",
      url: "/organization",
      headers: { cookie },
      payload: { name: "Nuevo nombre", timezoneDefault: "America/Bogota", simulationMode: false },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().organization.name).toBe("Nuevo nombre");
    expect(response.json().organization.simulationMode).toBe(false);
  });

  it("aísla la configuración entre organizaciones distintas", async () => {
    const orgA = await registerOwner("orga-settings@test.com");
    const orgB = await registerOwner("orgb-settings@test.com");

    await app.inject({
      method: "PATCH",
      url: "/organization",
      headers: { cookie: orgA.cookie },
      payload: { name: "Solo de A" },
    });

    const responseB = await app.inject({ method: "GET", url: "/organization", headers: { cookie: orgB.cookie } });
    expect(responseB.json().organization.name).not.toBe("Solo de A");
  });

  it("owner puede agregar un teammate con rol y la cuenta puede iniciar sesión", async () => {
    const { cookie } = await registerOwner("owner-team@test.com");

    const createResponse = await app.inject({
      method: "POST",
      url: "/organization/users",
      headers: { cookie },
      payload: { email: "agente@test.com", password: "ContraseñaSegura!2026", role: "agent" },
    });
    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json().user.role).toBe("agent");

    const loginResponse = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "agente@test.com", password: "ContraseñaSegura!2026" },
    });
    expect(loginResponse.statusCode).toBe(200);
    expect(loginResponse.json().role).toBe("agent");
  });

  it("un agente (rol no privilegiado) no puede agregar teammates ni cambiar configuración", async () => {
    const owner = await registerOwner("owner-perm@test.com");
    await app.inject({
      method: "POST",
      url: "/organization/users",
      headers: { cookie: owner.cookie },
      payload: { email: "agente2@test.com", password: "ContraseñaSegura!2026", role: "agent" },
    });
    const agentLogin = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "agente2@test.com", password: "ContraseñaSegura!2026" },
    });
    const agentCookie = extractCookie(agentLogin.headers["set-cookie"]);

    const patchResponse = await app.inject({
      method: "PATCH",
      url: "/organization",
      headers: { cookie: agentCookie },
      payload: { name: "Intento no autorizado" },
    });
    expect(patchResponse.statusCode).toBe(403);

    const createResponse = await app.inject({
      method: "POST",
      url: "/organization/users",
      headers: { cookie: agentCookie },
      payload: { email: "otro@test.com", password: "ContraseñaSegura!2026", role: "agent" },
    });
    expect(createResponse.statusCode).toBe(403);
  });

  it("desactivar un usuario le impide seguir usando la organización", async () => {
    const owner = await registerOwner("owner-deactivate@test.com");
    const createResponse = await app.inject({
      method: "POST",
      url: "/organization/users",
      headers: { cookie: owner.cookie },
      payload: { email: "temporal@test.com", password: "ContraseñaSegura!2026", role: "agent" },
    });
    const userId = createResponse.json().user.id;

    const deactivateResponse = await app.inject({
      method: "PATCH",
      url: `/organization/users/${userId}`,
      headers: { cookie: owner.cookie },
      payload: { isActive: false },
    });
    expect(deactivateResponse.statusCode).toBe(200);

    const loginResponse = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "temporal@test.com", password: "ContraseñaSegura!2026" },
    });
    expect(loginResponse.statusCode).toBe(401);
  });
});
