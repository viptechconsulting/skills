import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma, prisma, recordAuditLog } from "@lynkro-outbound/db";
import { normalizePhoneToE164 } from "@lynkro-outbound/shared";
import { enqueueCallDispatch } from "../lib/queues.js";

const createVoiceAgentSchema = z.object({
  name: z.string().min(1).max(150),
  persona: z.string().min(1).max(2000),
  tone: z.string().max(500).default(""),
  defaultLanguage: z.string().min(2).max(10).default("es"),
  voice: z.string().min(1).max(50).default("alloy"),
  ttsProvider: z.enum(["openai", "elevenlabs"]).default("openai"),
  elevenLabsVoiceId: z.string().max(100).optional(),
  systemPromptTemplate: z.string().min(1).max(200).default("default_v1"),
});

const testCallSchema = z.object({
  phone: z.string().min(3),
  defaultCountry: z.string().length(2).optional(),
  outboundPhoneNumberId: z.string().uuid(),
});

const SANDBOX_CAMPAIGN_NAME = "Sandbox de pruebas de agentes de voz";

export async function voiceAgentRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.get("/voice-agents", async (request, reply) => {
    const organizationId = request.auth!.organizationId;
    const voiceAgents = await prisma.voiceAgent.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } });
    return reply.send({ voiceAgents });
  });

  fastify.get("/voice-agents/:id", async (request, reply) => {
    const organizationId = request.auth!.organizationId;
    const { id } = request.params as { id: string };
    const voiceAgent = await prisma.voiceAgent.findFirst({ where: { id, organizationId } });
    if (!voiceAgent) return reply.code(404).send({ error: "VOICE_AGENT_NOT_FOUND" });
    return reply.send({ voiceAgent });
  });

  fastify.post("/voice-agents", { preHandler: fastify.requireRole(["owner", "admin"]) }, async (request, reply) => {
    const organizationId = request.auth!.organizationId;
    const parsed = createVoiceAgentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "VALIDATION_ERROR", details: parsed.error.issues });
    }
    const voiceAgent = await prisma.voiceAgent.create({ data: { organizationId, ...parsed.data } });

    await recordAuditLog(prisma, {
      organizationId,
      actorUserId: request.auth!.userId,
      entityType: "voice_agent",
      entityId: voiceAgent.id,
      action: "create",
      after: voiceAgent as never,
    });

    return reply.code(201).send({ voiceAgent });
  });

  fastify.patch("/voice-agents/:id", { preHandler: fastify.requireRole(["owner", "admin"]) }, async (request, reply) => {
    const organizationId = request.auth!.organizationId;
    const { id } = request.params as { id: string };
    const parsed = createVoiceAgentSchema.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "VALIDATION_ERROR", details: parsed.error.issues });
    }

    const before = await prisma.voiceAgent.findFirst({ where: { id, organizationId } });
    if (!before) return reply.code(404).send({ error: "VOICE_AGENT_NOT_FOUND" });

    await prisma.voiceAgent.updateMany({ where: { id, organizationId }, data: parsed.data });
    const voiceAgent = await prisma.voiceAgent.findFirst({ where: { id, organizationId } });

    await recordAuditLog(prisma, {
      organizationId,
      actorUserId: request.auth!.userId,
      entityType: "voice_agent",
      entityId: id,
      action: "update",
      before: before as never,
      after: voiceAgent as never,
    });

    return reply.send({ voiceAgent });
  });

  fastify.post("/voice-agents/:id/test-call", { preHandler: fastify.requireRole(["owner", "admin"]) }, async (request, reply) => {
    const organizationId = request.auth!.organizationId;
    const { id } = request.params as { id: string };
    const parsed = testCallSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "VALIDATION_ERROR", details: parsed.error.issues });
    }

    const voiceAgent = await prisma.voiceAgent.findFirst({ where: { id, organizationId } });
    if (!voiceAgent) return reply.code(404).send({ error: "VOICE_AGENT_NOT_FOUND" });

    const phoneNumber = await prisma.phoneNumber.findFirst({
      where: { id: parsed.data.outboundPhoneNumberId, organizationId },
    });
    if (!phoneNumber) return reply.code(400).send({ error: "PHONE_NUMBER_NOT_FOUND" });

    const normalized = normalizePhoneToE164(parsed.data.phone, parsed.data.defaultCountry as never);
    if (!normalized.ok || !normalized.e164) {
      return reply.code(400).send({ error: "INVALID_PHONE_NUMBER", reason: normalized.reason });
    }

    // Probar un agente de voz "suelto" (sin campaña real) reutiliza toda la
    // infraestructura de despacho de llamadas en vez de duplicarla: se
    // mantiene una única campaña sandbox oculta por organización
    // (isTest: true, nunca visible en el panel) cuyo agente y número de
    // salida se actualizan a los elegidos en cada prueba.
    let sandboxCampaign = await prisma.campaign.findFirst({ where: { organizationId, isTest: true } });
    const sandboxData = {
      voiceAgentId: id,
      outboundPhoneNumberId: phoneNumber.id,
      language: voiceAgent.defaultLanguage,
      agentInstructions:
        "Esta es una llamada de prueba interna para validar tu voz, personalidad y tono. Preséntate brevemente, " +
        "confirma en una frase que estás funcionando correctamente, y preguntá si la persona que escucha tiene " +
        "alguna instrucción antes de despedirte.",
    };
    if (!sandboxCampaign) {
      sandboxCampaign = await prisma.campaign.create({
        data: {
          organizationId,
          name: SANDBOX_CAMPAIGN_NAME,
          objective: "Prueba interna de agentes de voz",
          timezoneDefault: "America/Bogota",
          allowedWindowStart: "00:00",
          allowedWindowEnd: "23:59",
          maxAttempts: 1,
          attemptIntervalMinutes: 1440,
          bookingConditions: "No aplica: llamada de prueba interna.",
          transferConditions: "No aplica: llamada de prueba interna.",
          voicemailMessage: "Llamada de prueba interna, no dejar mensaje.",
          status: "active",
          simulationMode: false,
          consentRequired: false,
          isTest: true,
          ...sandboxData,
        },
      });
    } else {
      sandboxCampaign = await prisma.campaign.update({ where: { id: sandboxCampaign.id }, data: sandboxData });
    }

    const testProspect = await prisma.prospect.create({
      data: {
        organizationId,
        campaignId: sandboxCampaign.id,
        name: "Prueba de agente de voz",
        phoneE164: normalized.e164,
        language: voiceAgent.defaultLanguage,
        timezone: sandboxCampaign.timezoneDefault,
        intent: "Prueba de agente de voz",
        desiredOutcome: "Escuchar la personalidad, el tono y la voz configurados",
        source: "test",
        consentGiven: true,
        status: "queued",
        isTest: true,
      },
    });

    const call = await prisma.call.create({
      data: {
        organizationId,
        campaignId: sandboxCampaign.id,
        prospectId: testProspect.id,
        phoneNumberId: phoneNumber.id,
        status: "queued",
        attemptNumber: 1,
        simulation: false,
        isTest: true,
      },
    });

    await enqueueCallDispatch({ callId: call.id, organizationId, reason: "test" });

    return reply.code(202).send({ call });
  });

  fastify.delete("/voice-agents/:id", { preHandler: fastify.requireRole(["owner", "admin"]) }, async (request, reply) => {
    const organizationId = request.auth!.organizationId;
    const { id } = request.params as { id: string };
    const { reassignTo } = request.query as { reassignTo?: string };

    const voiceAgent = await prisma.voiceAgent.findFirst({ where: { id, organizationId } });
    if (!voiceAgent) return reply.code(404).send({ error: "VOICE_AGENT_NOT_FOUND" });

    const dependentCampaigns = await prisma.campaign.findMany({
      // isTest excluida: es la campaña sandbox de "Probar agente de voz", su
      // voiceAgentId es transitorio (se reasigna en cada prueba) y no
      // representa un uso real que deba bloquear el borrado.
      where: { organizationId, voiceAgentId: id, isTest: false },
      select: { id: true, name: true },
    });

    if (dependentCampaigns.length > 0) {
      if (!reassignTo) {
        // Sin reasignación: se informa qué campañas lo bloquean en vez de
        // solo rechazar — así el panel puede ofrecer directamente el picker
        // de reemplazo sin una segunda ida y vuelta a preguntar por qué.
        return reply.code(409).send({ error: "VOICE_AGENT_IN_USE", campaigns: dependentCampaigns });
      }
      if (reassignTo === id) {
        return reply.code(400).send({ error: "REASSIGN_TARGET_SAME_AS_DELETED" });
      }
      const replacement = await prisma.voiceAgent.findFirst({ where: { id: reassignTo, organizationId } });
      if (!replacement) return reply.code(400).send({ error: "REASSIGN_TARGET_NOT_FOUND" });

      await prisma.$transaction([
        prisma.campaign.updateMany({ where: { organizationId, voiceAgentId: id }, data: { voiceAgentId: reassignTo } }),
        prisma.voiceAgent.delete({ where: { id } }),
      ]);

      await recordAuditLog(prisma, {
        organizationId,
        actorUserId: request.auth!.userId,
        entityType: "voice_agent",
        entityId: id,
        action: "delete_reassigned",
        before: voiceAgent as never,
        after: { reassignedTo: reassignTo, campaignIds: dependentCampaigns.map((c) => c.id) } as never,
      });

      return reply.send({ ok: true, reassignedCampaigns: dependentCampaigns.length });
    }

    // La campaña sandbox de "Probar agente de voz" puede seguir apuntando a
    // este agente si fue el último probado — no bloquea el borrado (ver
    // arriba), pero hay que despegarla antes o el FK la va a bloquear igual.
    const sandboxUsingThisAgent = await prisma.campaign.findFirst({
      where: { organizationId, isTest: true, voiceAgentId: id },
    });
    if (sandboxUsingThisAgent) {
      const anotherAgent = await prisma.voiceAgent.findFirst({ where: { organizationId, id: { not: id } } });
      if (anotherAgent) {
        await prisma.campaign.update({ where: { id: sandboxUsingThisAgent.id }, data: { voiceAgentId: anotherAgent.id } });
      }
    }

    try {
      await prisma.voiceAgent.delete({ where: { id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        return reply.code(409).send({ error: "VOICE_AGENT_IN_USE", campaigns: [] });
      }
      throw error;
    }

    await recordAuditLog(prisma, {
      organizationId,
      actorUserId: request.auth!.userId,
      entityType: "voice_agent",
      entityId: id,
      action: "delete",
      before: voiceAgent as never,
    });

    return reply.send({ ok: true });
  });
}
