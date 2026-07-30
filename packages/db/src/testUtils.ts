import { PrismaClient } from "../generated/client/index.js";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/lynkro_outbound_test";

/**
 * Crea un PrismaClient dedicado a la base de datos de pruebas, sin
 * depender de DATABASE_URL global. Usado únicamente por la suite de tests
 * de integración de packages/db (nunca en apps en ejecución).
 */
export function createTestPrismaClient(): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url: TEST_DATABASE_URL } },
  });
}

export interface SeededOrgFixture {
  organizationId: string;
  phoneNumberId: string;
  voiceAgentId: string;
  campaignId: string;
}

/**
 * Crea una organización completa con sus dependencias mínimas (número de
 * salida, agente de voz, campaña activa) para usarse como fixture en tests
 * de integración.
 */
export async function seedOrganizationFixture(db: PrismaClient, label: string): Promise<SeededOrgFixture> {
  const organization = await db.organization.create({
    data: { name: `Org ${label}`, timezoneDefault: "America/Bogota" },
  });

  const phoneNumber = await db.phoneNumber.create({
    data: {
      organizationId: organization.id,
      e164: `+1500555${Math.floor(1000 + Math.random() * 8999)}`,
      label: `Número ${label}`,
    },
  });

  const voiceAgent = await db.voiceAgent.create({
    data: {
      organizationId: organization.id,
      name: `Agente ${label}`,
      persona: "Test persona",
      systemPromptTemplate: "default_v1",
    },
  });

  const campaign = await db.campaign.create({
    data: {
      organizationId: organization.id,
      name: `Campaña ${label}`,
      objective: "Objetivo de prueba",
      timezoneDefault: "America/Bogota",
      // Ventana de 24h (ver isWithinAllowedWindow: start === end => siempre
      // permitido) para que las pruebas de elegibilidad/despacho no sean
      // intermitentes según la hora del día en que se ejecuten.
      allowedWindowStart: "00:00",
      allowedWindowEnd: "00:00",
      outboundPhoneNumberId: phoneNumber.id,
      voiceAgentId: voiceAgent.id,
      agentInstructions: "Instrucciones de prueba",
      status: "active",
    },
  });

  return {
    organizationId: organization.id,
    phoneNumberId: phoneNumber.id,
    voiceAgentId: voiceAgent.id,
    campaignId: campaign.id,
  };
}

export async function resetTestDatabase(db: PrismaClient): Promise<void> {
  await db.$transaction([
    db.callToolExecution.deleteMany(),
    db.callEvent.deleteMany(),
    db.appointment.deleteMany(),
    db.call.deleteMany(),
    db.doNotCall.deleteMany(),
    db.prospect.deleteMany(),
    db.retryPolicy.deleteMany(),
    db.campaign.deleteMany(),
    db.voiceAgent.deleteMany(),
    db.phoneNumber.deleteMany(),
    db.integrationCredential.deleteMany(),
    db.session.deleteMany(),
    db.auditLog.deleteMany(),
    db.user.deleteMany(),
    db.organization.deleteMany(),
  ]);
}
