import type { FastifyInstance } from "fastify";
import { prisma } from "@lynkro-outbound/db";

export async function callRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.get("/calls", async (request, reply) => {
    const organizationId = request.auth!.organizationId;
    const query = request.query as { campaignId?: string };
    const calls = await prisma.call.findMany({
      where: { organizationId, ...(query.campaignId ? { campaignId: query.campaignId } : {}) },
      orderBy: { createdAt: "desc" },
      include: { prospect: true },
    });
    return reply.send({ calls });
  });

  fastify.get("/calls/:id", async (request, reply) => {
    const organizationId = request.auth!.organizationId;
    const { id } = request.params as { id: string };
    const call = await prisma.call.findFirst({
      where: { id, organizationId },
      include: {
        prospect: true,
        events: { orderBy: { createdAt: "asc" } },
        toolExecutions: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!call) return reply.code(404).send({ error: "CALL_NOT_FOUND" });
    return reply.send({ call });
  });

  fastify.get("/calls/:id/timeline", async (request, reply) => {
    const organizationId = request.auth!.organizationId;
    const { id } = request.params as { id: string };
    const call = await prisma.call.findFirst({ where: { id, organizationId } });
    if (!call) return reply.code(404).send({ error: "CALL_NOT_FOUND" });
    const events = await prisma.callEvent.findMany({ where: { callId: id }, orderBy: { createdAt: "asc" } });
    return reply.send({ events });
  });
}
