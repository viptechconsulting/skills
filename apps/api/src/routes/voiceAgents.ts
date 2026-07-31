import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma, prisma, recordAuditLog } from "@lynkro-outbound/db";

const createVoiceAgentSchema = z.object({
  name: z.string().min(1).max(150),
  persona: z.string().min(1).max(2000),
  tone: z.string().max(500).default(""),
  defaultLanguage: z.string().min(2).max(10).default("es"),
  voice: z.string().min(1).max(50).default("alloy"),
  systemPromptTemplate: z.string().min(1).max(200).default("default_v1"),
});

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

  fastify.delete("/voice-agents/:id", { preHandler: fastify.requireRole(["owner", "admin"]) }, async (request, reply) => {
    const organizationId = request.auth!.organizationId;
    const { id } = request.params as { id: string };

    const voiceAgent = await prisma.voiceAgent.findFirst({ where: { id, organizationId } });
    if (!voiceAgent) return reply.code(404).send({ error: "VOICE_AGENT_NOT_FOUND" });

    try {
      await prisma.voiceAgent.delete({ where: { id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        return reply.code(409).send({ error: "VOICE_AGENT_IN_USE" });
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
