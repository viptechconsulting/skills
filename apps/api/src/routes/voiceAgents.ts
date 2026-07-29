import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@lynkro-outbound/db";

const createVoiceAgentSchema = z.object({
  name: z.string().min(1).max(150),
  persona: z.string().min(1).max(2000),
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

  fastify.post("/voice-agents", { preHandler: fastify.requireRole(["owner", "admin"]) }, async (request, reply) => {
    const organizationId = request.auth!.organizationId;
    const parsed = createVoiceAgentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "VALIDATION_ERROR", details: parsed.error.issues });
    }
    const voiceAgent = await prisma.voiceAgent.create({ data: { organizationId, ...parsed.data } });
    return reply.code(201).send({ voiceAgent });
  });

  fastify.patch("/voice-agents/:id", { preHandler: fastify.requireRole(["owner", "admin"]) }, async (request, reply) => {
    const organizationId = request.auth!.organizationId;
    const { id } = request.params as { id: string };
    const parsed = createVoiceAgentSchema.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "VALIDATION_ERROR", details: parsed.error.issues });
    }
    const updated = await prisma.voiceAgent.updateMany({ where: { id, organizationId }, data: parsed.data });
    if (updated.count === 0) return reply.code(404).send({ error: "VOICE_AGENT_NOT_FOUND" });
    const voiceAgent = await prisma.voiceAgent.findFirst({ where: { id, organizationId } });
    return reply.send({ voiceAgent });
  });
}
