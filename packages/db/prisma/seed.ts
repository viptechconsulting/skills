/* eslint-disable no-console -- script de CLI: la salida por consola es el propósito del seed */
import { hashPassword } from "@lynkro-outbound/shared";
import { PrismaClient } from "../generated/client/index.js";

const prisma = new PrismaClient();

async function main() {
  console.log("Sembrando datos de demostración de Lynkro Outbound...");

  const organization = await prisma.organization.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Lynkro Demo",
      timezoneDefault: "America/Mexico_City",
      simulationMode: true,
      consentRequired: true,
    },
  });

  const demoPassword = process.env.SEED_DEMO_PASSWORD ?? "CambiaEstaClave!2026";
  await prisma.user.upsert({
    where: { organizationId_email: { organizationId: organization.id, email: "demo@lynkro.io" } },
    update: {},
    create: {
      organizationId: organization.id,
      email: "demo@lynkro.io",
      passwordHash: hashPassword(demoPassword),
      role: "owner",
    },
  });

  const phoneNumber = await prisma.phoneNumber.upsert({
    where: { organizationId_e164: { organizationId: organization.id, e164: "+15005550006" } },
    update: {},
    create: {
      organizationId: organization.id,
      e164: "+15005550006",
      label: "Número de salida de demostración (simulación)",
      provider: "twilio",
      isActive: true,
    },
  });

  const voiceAgent = await prisma.voiceAgent.upsert({
    where: { id: "00000000-0000-0000-0000-000000000002" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000002",
      organizationId: organization.id,
      name: "Sofía de Lynkro",
      persona:
        "Asistente virtual de Lynkro: cercana, clara y respetuosa del tiempo del prospecto. Nunca se hace pasar por humana.",
      defaultLanguage: "es",
      voice: "alloy",
      systemPromptTemplate: "default_v1",
    },
  });

  const campaign = await prisma.campaign.upsert({
    where: { id: "00000000-0000-0000-0000-000000000003" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000003",
      organizationId: organization.id,
      name: "Diagnóstico Lynkro",
      description:
        "Campaña de ejemplo: conocer cómo el negocio gestiona actualmente sus consultas entrantes y, si existe encaje, agendar una llamada estratégica.",
      language: "es",
      objective:
        "Entender cómo el prospecto maneja hoy sus consultas y leads, y si hay encaje, agendar una llamada estratégica con el equipo de Lynkro.",
      allowedWindowStart: "09:00",
      allowedWindowEnd: "19:00",
      timezoneDefault: "America/Mexico_City",
      outboundPhoneNumberId: phoneNumber.id,
      maxAttempts: 3,
      attemptIntervalMinutes: 240,
      targetCalendarId: null,
      voiceAgentId: voiceAgent.id,
      agentInstructions:
        "Pregunta primero cómo manejan hoy las consultas de nuevos clientes (WhatsApp, formularios, llamadas). Escucha antes de mencionar a Lynkro. Si detectas fricción real (leads perdidos, respuesta lenta, seguimiento manual), explica en una frase que Lynkro ayuda a automatizar ese seguimiento y pregunta si tiene sentido agendar una llamada estratégica de 20 minutos con el equipo.",
      qualificationQuestions: [
        { id: "q1", prompt: "¿Cómo gestionan hoy las consultas de nuevos clientes?", required: true },
        { id: "q2", prompt: "¿Aproximadamente cuántas consultas reciben por semana?", required: false },
        { id: "q3", prompt: "¿Sienten que se les escapan leads por falta de seguimiento?", required: true },
      ],
      bookingConditions:
        "Agendar solo si el prospecto confirma fricción real en su seguimiento actual y expresa interés en conocer más.",
      transferConditions: "Transferir si el prospecto pide hablar directamente con una persona del equipo.",
      voicemailMessage:
        "Hola, te contactamos de parte de Lynkro para conocer cómo gestionas tus consultas de clientes. Te llamaremos en otro momento. Que tengas buen día.",
      postCallBehavior: {
        sendConfirmationSmsOnBooking: true,
        sendFollowUpOnNoAnswer: false,
        followUpDelayMinutes: 1440,
      },
      status: "active",
      recordingEnabled: false,
      simulationMode: true,
      consentRequired: true,
      retryPolicies: {
        create: [
          { reason: "no_answer", maxAttempts: 2, intervalMinutes: 240, spreadAcrossDayparts: true },
          { reason: "busy", maxAttempts: 2, intervalMinutes: 60, spreadAcrossDayparts: false },
          { reason: "voicemail", maxAttempts: 1, intervalMinutes: 1440, spreadAcrossDayparts: false },
          { reason: "technical_failure", maxAttempts: 1, intervalMinutes: 30, spreadAcrossDayparts: false },
        ],
      },
    },
  });

  await prisma.prospect.upsert({
    where: {
      organizationId_phoneE164: { organizationId: organization.id, phoneE164: "+15005550009" },
    },
    update: {},
    create: {
      organizationId: organization.id,
      campaignId: campaign.id,
      name: "Mariana Torres",
      phoneE164: "+15005550009",
      company: "Clínica Dental Torres",
      email: "mariana@clinicatorres.example",
      language: "es",
      timezone: "America/Mexico_City",
      context: "Se registró en un formulario web preguntando por automatización de seguimiento de pacientes.",
      intent: "Conocer cómo gestiona actualmente sus consultas entrantes de pacientes potenciales.",
      desiredOutcome:
        "Si existe encaje, agendar una llamada estratégica de 20 minutos con el equipo de Lynkro.",
      source: "formulario_web",
      consentGiven: true,
      consentDate: new Date(),
      status: "new",
      tags: ["demo", "diagnostico-lynkro"],
    },
  });

  console.log("Seed completado:");
  console.log(`  Organización: ${organization.name} (${organization.id})`);
  console.log(`  Usuario demo: demo@lynkro.io (contraseña: ${demoPassword})`);
  console.log(`  Campaña: ${campaign.name} (${campaign.id})`);
}

main()
  .catch((error) => {
    console.error("Error al ejecutar el seed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
