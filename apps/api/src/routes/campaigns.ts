import type { FastifyInstance } from "fastify";
import { prisma } from "@lynkro-outbound/db";
import { createCampaignSchema, updateCampaignSchema } from "@lynkro-outbound/shared";
import { recordAuditLog } from "@lynkro-outbound/db";

export async function campaignRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.get("/campaigns", async (request, reply) => {
    const organizationId = request.auth!.organizationId;
    const campaigns = await prisma.campaign.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      include: { retryPolicies: true },
    });
    return reply.send({ campaigns });
  });

  fastify.get("/campaigns/:id", async (request, reply) => {
    const organizationId = request.auth!.organizationId;
    const { id } = request.params as { id: string };
    const campaign = await prisma.campaign.findFirst({
      where: { id, organizationId },
      include: { retryPolicies: true },
    });
    if (!campaign) return reply.code(404).send({ error: "CAMPAIGN_NOT_FOUND" });
    return reply.send({ campaign });
  });

  fastify.post("/campaigns", { preHandler: fastify.requireRole(["owner", "admin"]) }, async (request, reply) => {
    const organizationId = request.auth!.organizationId;
    const parsed = createCampaignSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "VALIDATION_ERROR", details: parsed.error.issues });
    }
    const data = parsed.data;

    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        name: data.name,
        description: data.description,
        language: data.language,
        objective: data.objective,
        allowedWindowStart: data.allowedWindow.start,
        allowedWindowEnd: data.allowedWindow.end,
        timezoneDefault: data.timezoneDefault,
        outboundPhoneNumberId: data.outboundPhoneNumberId,
        maxAttempts: data.maxAttempts,
        attemptIntervalMinutes: data.attemptIntervalMinutes,
        targetCalendarId: data.targetCalendarId,
        voiceAgentId: data.voiceAgentId,
        agentInstructions: data.agentInstructions,
        qualificationQuestions: data.qualificationQuestions,
        bookingConditions: data.bookingConditions,
        transferConditions: data.transferConditions,
        voicemailMessage: data.voicemailMessage,
        postCallBehavior: data.postCallBehavior,
        recordingEnabled: data.recordingEnabled,
        simulationMode: data.simulationMode,
        consentRequired: data.consentRequired,
        status: "draft",
        retryPolicies: {
          create: data.retryPolicies.map((rp) => ({
            reason: rp.reason,
            maxAttempts: rp.maxAttempts,
            intervalMinutes: rp.intervalMinutes,
            spreadAcrossDayparts: rp.spreadAcrossDayparts,
          })),
        },
      },
      include: { retryPolicies: true },
    });

    await recordAuditLog(prisma, {
      organizationId,
      actorUserId: request.auth!.userId,
      entityType: "campaign",
      entityId: campaign.id,
      action: "create",
      after: campaign as never,
    });

    return reply.code(201).send({ campaign });
  });

  fastify.patch("/campaigns/:id", { preHandler: fastify.requireRole(["owner", "admin"]) }, async (request, reply) => {
    const organizationId = request.auth!.organizationId;
    const { id } = request.params as { id: string };
    const parsed = updateCampaignSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "VALIDATION_ERROR", details: parsed.error.issues });
    }

    const before = await prisma.campaign.findFirst({ where: { id, organizationId } });
    if (!before) return reply.code(404).send({ error: "CAMPAIGN_NOT_FOUND" });

    const data = parsed.data;
    const updated = await prisma.campaign.updateMany({
      where: { id, organizationId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.language !== undefined ? { language: data.language } : {}),
        ...(data.objective !== undefined ? { objective: data.objective } : {}),
        ...(data.allowedWindow !== undefined
          ? { allowedWindowStart: data.allowedWindow.start, allowedWindowEnd: data.allowedWindow.end }
          : {}),
        ...(data.timezoneDefault !== undefined ? { timezoneDefault: data.timezoneDefault } : {}),
        ...(data.maxAttempts !== undefined ? { maxAttempts: data.maxAttempts } : {}),
        ...(data.attemptIntervalMinutes !== undefined
          ? { attemptIntervalMinutes: data.attemptIntervalMinutes }
          : {}),
        ...(data.targetCalendarId !== undefined ? { targetCalendarId: data.targetCalendarId } : {}),
        ...(data.outboundPhoneNumberId !== undefined ? { outboundPhoneNumberId: data.outboundPhoneNumberId } : {}),
        ...(data.voiceAgentId !== undefined ? { voiceAgentId: data.voiceAgentId } : {}),
        ...(data.agentInstructions !== undefined ? { agentInstructions: data.agentInstructions } : {}),
        ...(data.qualificationQuestions !== undefined
          ? { qualificationQuestions: data.qualificationQuestions }
          : {}),
        ...(data.bookingConditions !== undefined ? { bookingConditions: data.bookingConditions } : {}),
        ...(data.transferConditions !== undefined ? { transferConditions: data.transferConditions } : {}),
        ...(data.voicemailMessage !== undefined ? { voicemailMessage: data.voicemailMessage } : {}),
        ...(data.postCallBehavior !== undefined ? { postCallBehavior: data.postCallBehavior } : {}),
        ...(data.recordingEnabled !== undefined ? { recordingEnabled: data.recordingEnabled } : {}),
        ...(data.simulationMode !== undefined ? { simulationMode: data.simulationMode } : {}),
        ...(data.consentRequired !== undefined ? { consentRequired: data.consentRequired } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
      },
    });

    if (updated.count === 0) return reply.code(404).send({ error: "CAMPAIGN_NOT_FOUND" });

    const after = await prisma.campaign.findFirst({ where: { id, organizationId } });

    await recordAuditLog(prisma, {
      organizationId,
      actorUserId: request.auth!.userId,
      entityType: "campaign",
      entityId: id,
      action: "update",
      before: before as never,
      after: after as never,
    });

    return reply.send({ campaign: after });
  });

  fastify.delete("/campaigns/:id", { preHandler: fastify.requireRole(["owner", "admin"]) }, async (request, reply) => {
    const organizationId = request.auth!.organizationId;
    const { id } = request.params as { id: string };

    const updated = await prisma.campaign.updateMany({
      where: { id, organizationId },
      data: { status: "archived" },
    });
    if (updated.count === 0) return reply.code(404).send({ error: "CAMPAIGN_NOT_FOUND" });

    await recordAuditLog(prisma, {
      organizationId,
      actorUserId: request.auth!.userId,
      entityType: "campaign",
      entityId: id,
      action: "archive",
    });

    return reply.send({ ok: true });
  });
}
