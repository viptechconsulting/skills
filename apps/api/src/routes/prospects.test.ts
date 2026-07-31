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
    data: { organizationId, e164: "+15005550201", label: "Test" },
  });
  const voiceAgent = await prisma.voiceAgent.create({
    data: { organizationId, name: "Agente", persona: "Test", systemPromptTemplate: "default_v1" },
  });
  return { phoneNumber, voiceAgent };
}

describe("prospect routes: elegibilidad y acciones", () => {
  it("rechaza call-now cuando el prospecto está en Do Not Call", async () => {
    const { cookie, organizationId } = await registerAndGetCookie("dnc-reject@test.com");
    const { phoneNumber, voiceAgent } = await createPhoneAndAgent(organizationId);

    const campaignResponse = await app.inject({
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
        voiceAgentId: voiceAgent.id,
        agentInstructions: "Instrucciones",
      },
    });
    const campaignId = campaignResponse.json().campaign.id;
    await app.inject({ method: "PATCH", url: `/campaigns/${campaignId}`, headers: { cookie }, payload: { status: "active" } });

    const phone = "+14155559911";
    await prisma.doNotCall.create({ data: { organizationId, phoneE164: phone, reason: "solicitud previa" } });

    const prospectResponse = await app.inject({
      method: "POST",
      url: "/prospects",
      headers: { cookie },
      payload: {
        name: "Prospecto DNC",
        phone,
        language: "es",
        timezone: "America/Bogota",
        intent: "test",
        desiredOutcome: "test",
        source: "test",
        consentGiven: true,
        campaignId,
      },
    });
    const prospectId = prospectResponse.json().prospect.id;

    const callNowResponse = await app.inject({
      method: "POST",
      url: `/prospects/${prospectId}/call-now`,
      headers: { cookie },
    });

    expect(callNowResponse.statusCode).toBe(422);
    expect(callNowResponse.json().reason).toBe("DO_NOT_CALL_LISTED");
  });

  it("cancel detiene llamadas en estados no terminales y no toca las ya en curso", async () => {
    const { cookie, organizationId } = await registerAndGetCookie("cancel-test@test.com");
    const { phoneNumber, voiceAgent } = await createPhoneAndAgent(organizationId);
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        name: "Campaña cancel",
        objective: "Objetivo",
        timezoneDefault: "America/Bogota",
        outboundPhoneNumberId: phoneNumber.id,
        voiceAgentId: voiceAgent.id,
        agentInstructions: "Instrucciones",
        status: "active",
      },
    });
    const prospect = await prisma.prospect.create({
      data: {
        organizationId,
        campaignId: campaign.id,
        name: "Prospecto",
        phoneE164: "+14155559922",
        timezone: "America/Bogota",
        intent: "test",
        desiredOutcome: "test",
        source: "test",
        status: "scheduled",
      },
    });
    const queuedCall = await prisma.call.create({
      data: {
        organizationId,
        campaignId: campaign.id,
        prospectId: prospect.id,
        phoneNumberId: phoneNumber.id,
        status: "queued",
        attemptNumber: 1,
      },
    });

    const response = await app.inject({ method: "POST", url: `/prospects/${prospect.id}/cancel`, headers: { cookie } });
    expect(response.statusCode).toBe(200);

    const updatedCall = await prisma.call.findUniqueOrThrow({ where: { id: queuedCall.id } });
    expect(updatedCall.status).toBe("canceled");

    const updatedProspect = await prisma.prospect.findUniqueOrThrow({ where: { id: prospect.id } });
    expect(updatedProspect.status).toBe("new");
    expect(updatedProspect.nextAttemptAt).toBeNull();
  });

  it("rechaza crear un prospecto duplicado por teléfono dentro de la misma organización", async () => {
    const { cookie } = await registerAndGetCookie("dup-test@test.com");
    const payload = {
      name: "Prospecto",
      phone: "+14155559933",
      language: "es",
      timezone: "America/Bogota",
      intent: "test",
      desiredOutcome: "test",
      source: "test",
      consentGiven: true,
    };

    const first = await app.inject({ method: "POST", url: "/prospects", headers: { cookie }, payload });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({ method: "POST", url: "/prospects", headers: { cookie }, payload });
    expect(second.statusCode).toBe(409);
    expect(second.json().error).toBe("DUPLICATE_PROSPECT");
  });

  it("permite editar name/phone/company vía PATCH normalizando el teléfono a E.164", async () => {
    const { cookie } = await registerAndGetCookie("edit-ok@test.com");
    const created = await app.inject({
      method: "POST",
      url: "/prospects",
      headers: { cookie },
      payload: {
        name: "Nombre original",
        phone: "+14155559966",
        language: "es",
        timezone: "America/Bogota",
        intent: "test",
        desiredOutcome: "test",
        source: "test",
        consentGiven: true,
      },
    });
    const prospectId = created.json().prospect.id;

    const editResponse = await app.inject({
      method: "PATCH",
      url: `/prospects/${prospectId}`,
      headers: { cookie },
      payload: { name: "Nombre editado", phone: "+14155559977", company: "Acme" },
    });

    expect(editResponse.statusCode).toBe(200);
    const updated = editResponse.json().prospect;
    expect(updated.name).toBe("Nombre editado");
    expect(updated.phoneE164).toBe("+14155559977");
    expect(updated.company).toBe("Acme");
  });

  it("elimina un prospecto sin historial de llamadas", async () => {
    const { cookie } = await registerAndGetCookie("delete-ok@test.com");
    const created = await app.inject({
      method: "POST",
      url: "/prospects",
      headers: { cookie },
      payload: {
        name: "Prospecto a borrar",
        phone: "+14155559944",
        language: "es",
        timezone: "America/Bogota",
        intent: "test",
        desiredOutcome: "test",
        source: "test",
        consentGiven: true,
      },
    });
    const prospectId = created.json().prospect.id;

    const deleteResponse = await app.inject({ method: "DELETE", url: `/prospects/${prospectId}`, headers: { cookie } });
    expect(deleteResponse.statusCode).toBe(200);

    const getResponse = await app.inject({ method: "GET", url: `/prospects/${prospectId}`, headers: { cookie } });
    expect(getResponse.statusCode).toBe(404);
  });

  it("rechaza eliminar un prospecto que ya tiene llamadas registradas", async () => {
    const { cookie, organizationId } = await registerAndGetCookie("delete-blocked@test.com");
    const { phoneNumber, voiceAgent } = await createPhoneAndAgent(organizationId);
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        name: "Campaña con historial",
        objective: "Objetivo",
        timezoneDefault: "America/Bogota",
        outboundPhoneNumberId: phoneNumber.id,
        voiceAgentId: voiceAgent.id,
        agentInstructions: "Instrucciones",
        status: "active",
      },
    });
    const prospect = await prisma.prospect.create({
      data: {
        organizationId,
        campaignId: campaign.id,
        name: "Prospecto con historial",
        phoneE164: "+14155559955",
        timezone: "America/Bogota",
        intent: "test",
        desiredOutcome: "test",
        source: "test",
        status: "completed",
      },
    });
    await prisma.call.create({
      data: {
        organizationId,
        campaignId: campaign.id,
        prospectId: prospect.id,
        phoneNumberId: phoneNumber.id,
        status: "completed",
        attemptNumber: 1,
      },
    });

    const deleteResponse = await app.inject({ method: "DELETE", url: `/prospects/${prospect.id}`, headers: { cookie } });
    expect(deleteResponse.statusCode).toBe(409);
    expect(deleteResponse.json().error).toBe("PROSPECT_HAS_CALL_HISTORY");

    const stillThere = await prisma.prospect.findUnique({ where: { id: prospect.id } });
    expect(stillThere).not.toBeNull();
  });

  it("con force=true elimina el prospecto y su historial de llamadas asociado", async () => {
    const { cookie, organizationId } = await registerAndGetCookie("delete-forced@test.com");
    const { phoneNumber, voiceAgent } = await createPhoneAndAgent(organizationId);
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        name: "Campaña con historial",
        objective: "Objetivo",
        timezoneDefault: "America/Bogota",
        outboundPhoneNumberId: phoneNumber.id,
        voiceAgentId: voiceAgent.id,
        agentInstructions: "Instrucciones",
        status: "active",
      },
    });
    const prospect = await prisma.prospect.create({
      data: {
        organizationId,
        campaignId: campaign.id,
        name: "Prospecto a forzar",
        phoneE164: "+14155559966",
        timezone: "America/Bogota",
        intent: "test",
        desiredOutcome: "test",
        source: "test",
        status: "completed",
      },
    });
    const call = await prisma.call.create({
      data: {
        organizationId,
        campaignId: campaign.id,
        prospectId: prospect.id,
        phoneNumberId: phoneNumber.id,
        status: "completed",
        attemptNumber: 1,
      },
    });

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/prospects/${prospect.id}?force=true`,
      headers: { cookie },
    });
    expect(deleteResponse.statusCode).toBe(200);

    expect(await prisma.prospect.findUnique({ where: { id: prospect.id } })).toBeNull();
    expect(await prisma.call.findUnique({ where: { id: call.id } })).toBeNull();
  });

  it("bulk-delete elimina varios prospectos sin historial de una", async () => {
    const { cookie, organizationId } = await registerAndGetCookie("bulk-delete-ok@test.com");
    const prospects = await Promise.all(
      ["+14155559001", "+14155559002", "+14155559003"].map((phone, i) =>
        prisma.prospect.create({
          data: {
            organizationId,
            name: `Prospecto ${i}`,
            phoneE164: phone,
            timezone: "America/Bogota",
            intent: "test",
            desiredOutcome: "test",
            source: "test",
          },
        }),
      ),
    );

    const response = await app.inject({
      method: "POST",
      url: "/prospects/bulk-delete",
      headers: { cookie },
      payload: { ids: prospects.map((p) => p.id) },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ deletedCount: 3, blocked: [], notFound: [] });
    const remaining = await prisma.prospect.findMany({ where: { organizationId } });
    expect(remaining).toHaveLength(0);
  });

  it("bulk-delete reporta los que tienen historial de llamadas en vez de fallar todo el lote", async () => {
    const { cookie, organizationId } = await registerAndGetCookie("bulk-delete-mixed@test.com");
    const { phoneNumber, voiceAgent } = await createPhoneAndAgent(organizationId);
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        name: "Campaña",
        objective: "Objetivo",
        timezoneDefault: "America/Bogota",
        outboundPhoneNumberId: phoneNumber.id,
        voiceAgentId: voiceAgent.id,
        agentInstructions: "Instrucciones",
        status: "active",
      },
    });
    const withHistory = await prisma.prospect.create({
      data: {
        organizationId,
        campaignId: campaign.id,
        name: "Con historial",
        phoneE164: "+14155559011",
        timezone: "America/Bogota",
        intent: "test",
        desiredOutcome: "test",
        source: "test",
      },
    });
    await prisma.call.create({
      data: {
        organizationId,
        campaignId: campaign.id,
        prospectId: withHistory.id,
        phoneNumberId: phoneNumber.id,
        status: "completed",
        attemptNumber: 1,
      },
    });
    const withoutHistory = await prisma.prospect.create({
      data: {
        organizationId,
        name: "Sin historial",
        phoneE164: "+14155559012",
        timezone: "America/Bogota",
        intent: "test",
        desiredOutcome: "test",
        source: "test",
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/prospects/bulk-delete",
      headers: { cookie },
      payload: { ids: [withHistory.id, withoutHistory.id] },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.deletedCount).toBe(1);
    expect(body.blocked).toEqual([{ id: withHistory.id, name: "Con historial" }]);
    expect(await prisma.prospect.findUnique({ where: { id: withHistory.id } })).not.toBeNull();
    expect(await prisma.prospect.findUnique({ where: { id: withoutHistory.id } })).toBeNull();
  });

  it("bulk-delete con force=true borra también el historial de los bloqueados", async () => {
    const { cookie, organizationId } = await registerAndGetCookie("bulk-delete-forced@test.com");
    const { phoneNumber, voiceAgent } = await createPhoneAndAgent(organizationId);
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        name: "Campaña",
        objective: "Objetivo",
        timezoneDefault: "America/Bogota",
        outboundPhoneNumberId: phoneNumber.id,
        voiceAgentId: voiceAgent.id,
        agentInstructions: "Instrucciones",
        status: "active",
      },
    });
    const withHistory = await prisma.prospect.create({
      data: {
        organizationId,
        campaignId: campaign.id,
        name: "Con historial",
        phoneE164: "+14155559021",
        timezone: "America/Bogota",
        intent: "test",
        desiredOutcome: "test",
        source: "test",
      },
    });
    const call = await prisma.call.create({
      data: {
        organizationId,
        campaignId: campaign.id,
        prospectId: withHistory.id,
        phoneNumberId: phoneNumber.id,
        status: "completed",
        attemptNumber: 1,
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/prospects/bulk-delete",
      headers: { cookie },
      payload: { ids: [withHistory.id], force: true },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ deletedCount: 1, blocked: [] });
    expect(await prisma.prospect.findUnique({ where: { id: withHistory.id } })).toBeNull();
    expect(await prisma.call.findUnique({ where: { id: call.id } })).toBeNull();
  });

  it("bulk-delete ignora ids que no pertenecen a la organización", async () => {
    const { cookie } = await registerAndGetCookie("bulk-delete-scoped@test.com");
    const { organizationId: otherOrgId } = await registerAndGetCookie("bulk-delete-other-org@test.com");
    const otherOrgProspect = await prisma.prospect.create({
      data: {
        organizationId: otherOrgId,
        name: "De otra organización",
        phoneE164: "+14155559031",
        timezone: "America/Bogota",
        intent: "test",
        desiredOutcome: "test",
        source: "test",
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/prospects/bulk-delete",
      headers: { cookie },
      payload: { ids: [otherOrgProspect.id] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ deletedCount: 0, blocked: [], notFound: [otherOrgProspect.id] });
    expect(await prisma.prospect.findUnique({ where: { id: otherOrgProspect.id } })).not.toBeNull();
  });
});
