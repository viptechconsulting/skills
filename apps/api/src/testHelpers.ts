import "./testSetup.js";
import { prisma } from "@lynkro-outbound/db";
import { buildServer } from "./server.js";

export async function resetDatabase(): Promise<void> {
  await prisma.$transaction([
    prisma.callToolExecution.deleteMany(),
    prisma.callEvent.deleteMany(),
    prisma.appointment.deleteMany(),
    prisma.call.deleteMany(),
    prisma.doNotCall.deleteMany(),
    prisma.prospect.deleteMany(),
    prisma.retryPolicy.deleteMany(),
    prisma.campaign.deleteMany(),
    prisma.voiceAgent.deleteMany(),
    prisma.phoneNumber.deleteMany(),
    prisma.integrationCredential.deleteMany(),
    prisma.session.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.user.deleteMany(),
    prisma.organization.deleteMany(),
  ]);
}

export async function buildTestApp() {
  return buildServer();
}

export async function seedOrgWithCampaign(label: string) {
  const organization = await prisma.organization.create({ data: { name: `Org ${label}` } });
  const phoneNumber = await prisma.phoneNumber.create({
    data: {
      organizationId: organization.id,
      e164: `+1500555${Math.floor(1000 + Math.random() * 8999)}`,
      label: `Número ${label}`,
    },
  });
  const voiceAgent = await prisma.voiceAgent.create({
    data: {
      organizationId: organization.id,
      name: `Agente ${label}`,
      persona: "Test",
      systemPromptTemplate: "default_v1",
    },
  });
  const campaign = await prisma.campaign.create({
    data: {
      organizationId: organization.id,
      name: `Campaña ${label}`,
      objective: "Objetivo de prueba",
      timezoneDefault: "America/Bogota",
      outboundPhoneNumberId: phoneNumber.id,
      voiceAgentId: voiceAgent.id,
      agentInstructions: "Instrucciones de prueba",
      status: "active",
    },
  });
  return { organization, phoneNumber, voiceAgent, campaign };
}
