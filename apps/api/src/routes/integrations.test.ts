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
  return extractCookie(response.headers["set-cookie"]);
}

describe("integration routes", () => {
  it("guarda credenciales de Twilio vía PUT y aparecen como configuradas", async () => {
    const cookie = await registerOwner("integ-twilio@test.com");

    const before = await app.inject({ method: "GET", url: "/integrations", headers: { cookie } });
    expect(before.json().configured).not.toContain("twilio");

    const saveResponse = await app.inject({
      method: "PUT",
      url: "/integrations/twilio",
      headers: { cookie },
      payload: { accountSid: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", authToken: "sometoken" },
    });
    expect(saveResponse.statusCode).toBe(200);

    const after = await app.inject({ method: "GET", url: "/integrations", headers: { cookie } });
    expect(after.json().configured).toContain("twilio");
  });

  it("rechaza un proveedor desconocido", async () => {
    const cookie = await registerOwner("integ-invalid@test.com");
    const response = await app.inject({
      method: "PUT",
      url: "/integrations/not-a-real-provider",
      headers: { cookie },
      payload: { foo: "bar" },
    });
    expect(response.statusCode).toBe(400);
  });

  it("nunca devuelve las credenciales guardadas en la respuesta", async () => {
    const cookie = await registerOwner("integ-secret@test.com");
    const saveResponse = await app.inject({
      method: "PUT",
      url: "/integrations/openai",
      headers: { cookie },
      payload: { apiKey: "sk-test-super-secret-value", model: "gpt-4o-realtime-preview" },
    });
    expect(JSON.stringify(saveResponse.json())).not.toContain("sk-test-super-secret-value");
  });
});
