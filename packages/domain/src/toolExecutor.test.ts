import { afterAll, afterEach, describe, expect, it } from "vitest";
import "./testSetup.js";
import { prisma } from "@lynkro-outbound/db";
import { resetTestDatabase, seedOrganizationFixture } from "@lynkro-outbound/db/test-utils";
import { buildAdapterBundle } from "@lynkro-outbound/adapters";
import { executeAgentTool } from "./toolExecutor.js";

afterEach(async () => {
  await resetTestDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function createProspectAndCall(organizationId: string, campaignId: string, phone: string) {
  const prospect = await prisma.prospect.create({
    data: {
      organizationId,
      campaignId,
      name: "Prospecto de prueba",
      phoneE164: phone,
      timezone: "America/Bogota",
      intent: "test",
      desiredOutcome: "test",
      source: "test",
    },
  });
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  const call = await prisma.call.create({
    data: {
      organizationId,
      campaignId,
      prospectId: prospect.id,
      phoneNumberId: campaign.outboundPhoneNumberId,
      status: "in_progress",
      attemptNumber: 1,
      providerCallSid: "SIMCALL_test",
    },
  });
  return { prospect, call };
}

describe("executeAgentTool guardrails", () => {
  it("rechaza una herramienta desconocida", async () => {
    const org = await seedOrganizationFixture(prisma, "ToolA");
    const { call } = await createProspectAndCall(org.organizationId, org.campaignId, "+14155551001");
    const adapters = buildAdapterBundle({ simulationMode: true });

    const outcome = await executeAgentTool(
      { organizationId: org.organizationId, callId: call.id, adapters },
      "delete_database",
      {},
    );

    expect(outcome.authorized).toBe(false);
    expect(outcome.errorMessage).toBe("UNKNOWN_TOOL");
  });

  it("rechaza argumentos inválidos con Zod antes de ejecutar la herramienta", async () => {
    const org = await seedOrganizationFixture(prisma, "ToolB");
    const { call } = await createProspectAndCall(org.organizationId, org.campaignId, "+14155551002");
    const adapters = buildAdapterBundle({ simulationMode: true });

    const outcome = await executeAgentTool(
      { organizationId: org.organizationId, callId: call.id, adapters },
      "end_call",
      { callId: call.id, outcome: "NOT_A_VALID_OUTCOME", summary: "" },
    );

    expect(outcome.authorized).toBe(false);
    expect(outcome.errorMessage).toContain("INVALID_ARGS");
  });

  it("registra auditoría (CallToolExecution) para cada intento, autorizado o no", async () => {
    const org = await seedOrganizationFixture(prisma, "ToolC");
    const { call } = await createProspectAndCall(org.organizationId, org.campaignId, "+14155551003");
    const adapters = buildAdapterBundle({ simulationMode: true });

    await executeAgentTool({ organizationId: org.organizationId, callId: call.id, adapters }, "unknown_tool_x", {});

    const executions = await prisma.callToolExecution.findMany({ where: { callId: call.id } });
    expect(executions).toHaveLength(1);
    expect(executions[0]?.authorized).toBe(false);
  });

  it("mark_do_not_call bloquea al prospecto y lo agrega a la lista DNC de la organización", async () => {
    const org = await seedOrganizationFixture(prisma, "ToolD");
    const { prospect, call } = await createProspectAndCall(org.organizationId, org.campaignId, "+14155551004");
    const adapters = buildAdapterBundle({ simulationMode: true });

    const outcome = await executeAgentTool(
      { organizationId: org.organizationId, callId: call.id, adapters },
      "mark_do_not_call",
      { callId: call.id, reason: "El prospecto lo solicitó explícitamente" },
    );

    expect(outcome.authorized).toBe(true);

    const dncEntry = await prisma.doNotCall.findFirst({
      where: { organizationId: org.organizationId, phoneE164: prospect.phoneE164 },
    });
    expect(dncEntry).not.toBeNull();

    const updatedProspect = await prisma.prospect.findUniqueOrThrow({ where: { id: prospect.id } });
    expect(updatedProspect.isBlocked).toBe(true);
    expect(updatedProspect.status).toBe("do_not_call");
  });

  it("end_call exige y persiste un resultado estructurado válido", async () => {
    const org = await seedOrganizationFixture(prisma, "ToolE");
    const { prospect, call } = await createProspectAndCall(org.organizationId, org.campaignId, "+14155551005");
    const adapters = buildAdapterBundle({ simulationMode: true });

    const outcome = await executeAgentTool(
      { organizationId: org.organizationId, callId: call.id, adapters },
      "end_call",
      { callId: call.id, outcome: "QUALIFIED_NOT_BOOKED", summary: "El prospecto mostró interés." },
    );
    expect(outcome.authorized).toBe(true);

    const updatedCall = await prisma.call.findUniqueOrThrow({ where: { id: call.id } });
    expect(updatedCall.outcome).toBe("QUALIFIED_NOT_BOOKED");

    const updatedProspect = await prisma.prospect.findUniqueOrThrow({ where: { id: prospect.id } });
    expect(updatedProspect.finalOutcome).toBe("QUALIFIED_NOT_BOOKED");
  });

  it("book_appointment falla de forma controlada si la campaña no tiene calendario configurado", async () => {
    const org = await seedOrganizationFixture(prisma, "ToolF");
    const { call } = await createProspectAndCall(org.organizationId, org.campaignId, "+14155551006");
    const adapters = buildAdapterBundle({ simulationMode: true });

    const outcome = await executeAgentTool(
      { organizationId: org.organizationId, callId: call.id, adapters },
      "book_appointment",
      {
        callId: call.id,
        confirmedSlot: { startUtc: new Date().toISOString(), endUtc: new Date(Date.now() + 1800000).toISOString() },
        timezone: "America/Bogota",
      },
    );

    expect(outcome.authorized).toBe(true);
    expect(outcome.errorMessage).toBe("NO_CALENDAR_CONFIGURED");
  });
});
