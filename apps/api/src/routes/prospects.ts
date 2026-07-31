import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma, prisma, recordAuditLog } from "@lynkro-outbound/db";
import {
  createProspectSchema,
  normalizePhoneToE164,
  scheduleCallSchema,
  updateProspectSchema,
  PROSPECT_STATUSES,
} from "@lynkro-outbound/shared";
import { importProspectsFromCsv } from "../services/csvImportService.js";
import { checkProspectEligibility } from "@lynkro-outbound/domain";
import { enqueueCallDispatch } from "../lib/queues.js";

const listProspectsQuerySchema = z.object({
  campaignId: z.string().uuid().optional(),
  status: z.enum(PROSPECT_STATUSES).optional(),
});

const bulkDeleteProspectsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  force: z.boolean().optional().default(false),
});

export async function prospectRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.get("/prospects", async (request, reply) => {
    const organizationId = request.auth!.organizationId;
    const parsedQuery = listProspectsQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.code(400).send({ error: "VALIDATION_ERROR", details: parsedQuery.error.issues });
    }
    const query = parsedQuery.data;
    const prospects = await prisma.prospect.findMany({
      where: {
        organizationId,
        // Contactos sintéticos creados por "Llamar de prueba" — nunca son
        // prospectos reales, no deben aparecer en este listado.
        isTest: false,
        ...(query.campaignId ? { campaignId: query.campaignId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    return reply.send({ prospects });
  });

  fastify.post("/prospects", async (request, reply) => {
    const organizationId = request.auth!.organizationId;
    const parsed = createProspectSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "VALIDATION_ERROR", details: parsed.error.issues });
    }
    const data = parsed.data;
    const normalized = normalizePhoneToE164(data.phone, data.defaultCountry as never);
    if (!normalized.ok || !normalized.e164) {
      return reply.code(400).send({ error: "INVALID_PHONE_NUMBER", reason: normalized.reason });
    }

    const existing = await prisma.prospect.findFirst({
      where: { organizationId, phoneE164: normalized.e164 },
    });
    if (existing) {
      return reply.code(409).send({ error: "DUPLICATE_PROSPECT", prospectId: existing.id });
    }

    const prospect = await prisma.prospect.create({
      data: {
        organizationId,
        campaignId: data.campaignId,
        name: data.name,
        phoneE164: normalized.e164,
        company: data.company,
        email: data.email,
        language: data.language,
        timezone: data.timezone,
        context: data.context,
        intent: data.intent,
        desiredOutcome: data.desiredOutcome,
        source: data.source,
        consentGiven: data.consentGiven,
        consentDate: data.consentDate,
        tags: data.tags,
        status: "new",
      },
    });

    return reply.code(201).send({ prospect });
  });

  fastify.post("/prospects/import", async (request, reply) => {
    const organizationId = request.auth!.organizationId;
    const file = await request.file();
    if (!file) return reply.code(400).send({ error: "NO_FILE_PROVIDED" });
    const buffer = await file.toBuffer();
    const result = await importProspectsFromCsv(organizationId, buffer.toString("utf-8"));

    await recordAuditLog(prisma, {
      organizationId,
      actorUserId: request.auth!.userId,
      entityType: "prospect_import",
      entityId: "csv",
      action: "import",
      after: result as never,
    });

    return reply.send({ result });
  });

  fastify.get("/prospects/:id", async (request, reply) => {
    const organizationId = request.auth!.organizationId;
    const { id } = request.params as { id: string };
    const prospect = await prisma.prospect.findFirst({ where: { id, organizationId } });
    if (!prospect) return reply.code(404).send({ error: "PROSPECT_NOT_FOUND" });
    return reply.send({ prospect });
  });

  fastify.patch("/prospects/:id", async (request, reply) => {
    const organizationId = request.auth!.organizationId;
    const { id } = request.params as { id: string };
    const parsed = updateProspectSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "VALIDATION_ERROR", details: parsed.error.issues });
    }
    // `phone`/`defaultCountry` son campos de entrada (crudos); la columna real
    // es `phoneE164`, normalizada igual que en la creación del prospecto.
    const { phone, defaultCountry, ...rest } = parsed.data;
    const data: Record<string, unknown> = { ...rest };

    if (phone !== undefined) {
      const normalized = normalizePhoneToE164(phone, defaultCountry as never);
      if (!normalized.ok || !normalized.e164) {
        return reply.code(400).send({ error: "INVALID_PHONE_NUMBER", reason: normalized.reason });
      }
      const existing = await prisma.prospect.findFirst({
        where: { organizationId, phoneE164: normalized.e164, id: { not: id } },
      });
      if (existing) {
        return reply.code(409).send({ error: "DUPLICATE_PROSPECT", prospectId: existing.id });
      }
      data.phoneE164 = normalized.e164;
    }

    const updated = await prisma.prospect.updateMany({ where: { id, organizationId }, data: data as never });
    if (updated.count === 0) return reply.code(404).send({ error: "PROSPECT_NOT_FOUND" });
    const prospect = await prisma.prospect.findFirst({ where: { id, organizationId } });
    return reply.send({ prospect });
  });

  fastify.get("/prospects/:id/history", async (request, reply) => {
    const organizationId = request.auth!.organizationId;
    const { id } = request.params as { id: string };
    const calls = await prisma.call.findMany({
      where: { organizationId, prospectId: id },
      orderBy: { createdAt: "desc" },
      include: { events: true },
    });
    return reply.send({ calls });
  });

  fastify.post("/prospects/:id/call-now", async (request, reply) => {
    const organizationId = request.auth!.organizationId;
    const { id } = request.params as { id: string };

    const eligibility = await checkProspectEligibility(organizationId, id);
    if (!eligibility) return reply.code(404).send({ error: "PROSPECT_OR_CAMPAIGN_NOT_FOUND" });
    if (!eligibility.result.eligible) {
      return reply.code(422).send({ error: "NOT_ELIGIBLE", reason: eligibility.result.reason });
    }

    const call = await prisma.call.create({
      data: {
        organizationId,
        campaignId: eligibility.campaign.id,
        prospectId: id,
        phoneNumberId: eligibility.campaign.outboundPhoneNumberId,
        status: "queued",
        attemptNumber: eligibility.prospect.attemptCount + 1,
        simulation: eligibility.campaign.simulationMode,
      },
    });

    await prisma.prospect.update({ where: { id }, data: { status: "queued" } });

    await enqueueCallDispatch({ callId: call.id, organizationId, reason: "manual" });

    return reply.code(202).send({ call });
  });

  fastify.post("/prospects/:id/schedule", async (request, reply) => {
    const organizationId = request.auth!.organizationId;
    const { id } = request.params as { id: string };
    const parsed = scheduleCallSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "VALIDATION_ERROR", details: parsed.error.issues });
    }
    const updated = await prisma.prospect.updateMany({
      where: { id, organizationId },
      data: { status: "scheduled", nextAttemptAt: parsed.data.scheduledAtUtc },
    });
    if (updated.count === 0) return reply.code(404).send({ error: "PROSPECT_NOT_FOUND" });
    return reply.send({ ok: true });
  });

  fastify.post("/prospects/:id/cancel", async (request, reply) => {
    const organizationId = request.auth!.organizationId;
    const { id } = request.params as { id: string };
    await prisma.prospect.updateMany({
      where: { id, organizationId },
      data: { status: "new", nextAttemptAt: null },
    });
    await prisma.call.updateMany({
      where: { organizationId, prospectId: id, status: { in: ["draft", "scheduled", "queued"] } },
      data: { status: "canceled", endedAt: new Date() },
    });
    return reply.send({ ok: true });
  });

  fastify.post("/prospects/:id/retry", async (request, reply) => {
    const organizationId = request.auth!.organizationId;
    const { id } = request.params as { id: string };

    const eligibility = await checkProspectEligibility(organizationId, id);
    if (!eligibility) return reply.code(404).send({ error: "PROSPECT_OR_CAMPAIGN_NOT_FOUND" });
    if (!eligibility.result.eligible) {
      return reply.code(422).send({ error: "NOT_ELIGIBLE", reason: eligibility.result.reason });
    }

    const call = await prisma.call.create({
      data: {
        organizationId,
        campaignId: eligibility.campaign.id,
        prospectId: id,
        phoneNumberId: eligibility.campaign.outboundPhoneNumberId,
        status: "queued",
        attemptNumber: eligibility.prospect.attemptCount + 1,
        simulation: eligibility.campaign.simulationMode,
      },
    });
    await enqueueCallDispatch({ callId: call.id, organizationId, reason: "retry" });
    return reply.code(202).send({ call });
  });

  fastify.post("/prospects/:id/block", async (request, reply) => {
    const organizationId = request.auth!.organizationId;
    const { id } = request.params as { id: string };
    const updated = await prisma.prospect.updateMany({
      where: { id, organizationId },
      data: { isBlocked: true, status: "blocked", nextAttemptAt: null },
    });
    if (updated.count === 0) return reply.code(404).send({ error: "PROSPECT_NOT_FOUND" });

    await recordAuditLog(prisma, {
      organizationId,
      actorUserId: request.auth!.userId,
      entityType: "prospect",
      entityId: id,
      action: "block",
    });

    return reply.send({ ok: true });
  });

  fastify.post("/prospects/bulk-delete", { preHandler: fastify.requireRole(["owner", "admin"]) }, async (request, reply) => {
    const organizationId = request.auth!.organizationId;
    const parsed = bulkDeleteProspectsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "VALIDATION_ERROR", details: parsed.error.issues });
    }
    const { ids, force } = parsed.data;

    const prospects = await prisma.prospect.findMany({ where: { id: { in: ids }, organizationId } });
    const foundIds = new Set(prospects.map((p) => p.id));

    const blocked: Array<{ id: string; name: string }> = [];
    let deletedCount = 0;

    for (const prospect of prospects) {
      try {
        if (force) {
          // Igual que el borrado individual forzado: se lleva también el
          // historial de llamadas/citas. Solo se llega acá si el usuario
          // confirmó explícitamente borrar ese historial a propósito.
          await prisma.$transaction([
            prisma.call.deleteMany({ where: { prospectId: prospect.id, organizationId } }),
            prisma.appointment.deleteMany({ where: { prospectId: prospect.id, organizationId } }),
            prisma.prospect.delete({ where: { id: prospect.id } }),
          ]);
        } else {
          await prisma.prospect.delete({ where: { id: prospect.id } });
        }
        deletedCount += 1;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
          blocked.push({ id: prospect.id, name: prospect.name });
        } else {
          throw error;
        }
      }
    }

    await recordAuditLog(prisma, {
      organizationId,
      actorUserId: request.auth!.userId,
      entityType: "prospect",
      entityId: "bulk",
      action: force ? "bulk_delete_forced_with_history" : "bulk_delete",
      after: { requestedIds: ids, deletedCount, blockedIds: blocked.map((b) => b.id) } as never,
    });

    return reply.send({
      deletedCount,
      blocked,
      notFound: ids.filter((id) => !foundIds.has(id)),
    });
  });

  fastify.delete("/prospects/:id", { preHandler: fastify.requireRole(["owner", "admin"]) }, async (request, reply) => {
    const organizationId = request.auth!.organizationId;
    const { id } = request.params as { id: string };
    const force = (request.query as { force?: string }).force === "true";
    const prospect = await prisma.prospect.findFirst({ where: { id, organizationId } });
    if (!prospect) return reply.code(404).send({ error: "PROSPECT_NOT_FOUND" });

    try {
      if (force) {
        // Eliminación forzada explícita: borra también el historial de
        // llamadas/citas del prospecto (CallEvent/CallToolExecution caen en
        // cascada desde Call). Solo se llega aquí si el usuario confirmó
        // borrar el historial a propósito.
        await prisma.$transaction([
          prisma.call.deleteMany({ where: { prospectId: id, organizationId } }),
          prisma.appointment.deleteMany({ where: { prospectId: id, organizationId } }),
          prisma.prospect.delete({ where: { id } }),
        ]);
      } else {
        await prisma.prospect.delete({ where: { id } });
      }
    } catch (error) {
      // El prospecto tiene llamadas o citas asociadas (ON DELETE RESTRICT):
      // preservamos ese historial por defecto en vez de borrarlo en cascada.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        return reply.code(409).send({ error: "PROSPECT_HAS_CALL_HISTORY" });
      }
      throw error;
    }

    await recordAuditLog(prisma, {
      organizationId,
      actorUserId: request.auth!.userId,
      entityType: "prospect",
      entityId: id,
      action: force ? "delete_forced_with_history" : "delete",
      before: prospect as never,
    });

    return reply.send({ ok: true });
  });
}
