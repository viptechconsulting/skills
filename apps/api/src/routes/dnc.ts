import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma, addToDoNotCallList, findDoNotCallByOrganization, removeFromDoNotCallScoped, recordAuditLog } from "@lynkro-outbound/db";
import { e164Schema } from "@lynkro-outbound/shared";

const createDncSchema = z.object({
  phone: e164Schema,
  reason: z.string().min(1).max(500),
});

export async function dncRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.get("/dnc", async (request, reply) => {
    const organizationId = request.auth!.organizationId;
    const entries = await findDoNotCallByOrganization(prisma, organizationId);
    return reply.send({ entries });
  });

  fastify.post("/dnc", async (request, reply) => {
    const organizationId = request.auth!.organizationId;
    const parsed = createDncSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "VALIDATION_ERROR", details: parsed.error.issues });
    }
    const entry = await addToDoNotCallList(
      prisma,
      organizationId,
      parsed.data.phone,
      parsed.data.reason,
      "manual_panel",
    );

    await prisma.prospect.updateMany({
      where: { organizationId, phoneE164: parsed.data.phone },
      data: { isBlocked: true, status: "do_not_call", nextAttemptAt: null },
    });

    await recordAuditLog(prisma, {
      organizationId,
      actorUserId: request.auth!.userId,
      entityType: "do_not_call",
      entityId: entry.id,
      action: "create",
      after: entry as never,
    });

    return reply.code(201).send({ entry });
  });

  fastify.delete("/dnc/:id", { preHandler: fastify.requireRole(["owner", "admin"]) }, async (request, reply) => {
    const organizationId = request.auth!.organizationId;
    const { id } = request.params as { id: string };
    const result = await removeFromDoNotCallScoped(prisma, organizationId, id);
    if (result.count === 0) return reply.code(404).send({ error: "DNC_ENTRY_NOT_FOUND" });

    await recordAuditLog(prisma, {
      organizationId,
      actorUserId: request.auth!.userId,
      entityType: "do_not_call",
      entityId: id,
      action: "delete",
    });

    return reply.send({ ok: true });
  });
}
