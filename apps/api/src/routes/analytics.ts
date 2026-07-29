import type { FastifyInstance } from "fastify";
import { computeCampaignAnalytics, computeOrganizationAnalytics } from "../services/analyticsService.js";

export async function analyticsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.get("/analytics/organization", async (request, reply) => {
    const organizationId = request.auth!.organizationId;
    const analytics = await computeOrganizationAnalytics(organizationId);
    return reply.send({ analytics });
  });

  fastify.get("/analytics/campaigns/:id", async (request, reply) => {
    const organizationId = request.auth!.organizationId;
    const { id } = request.params as { id: string };
    const analytics = await computeCampaignAnalytics(organizationId, id);
    return reply.send({ analytics });
  });
}
