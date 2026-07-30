import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma, recordAuditLog } from "@lynkro-outbound/db";
import {
  createTeamMemberSchema,
  hashPassword,
  updateOrganizationSettingsSchema,
  USER_ROLES,
} from "@lynkro-outbound/shared";

const updateTeamMemberSchema = z.object({
  role: z.enum(USER_ROLES).optional(),
  isActive: z.boolean().optional(),
});

export async function organizationRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.get("/organization", async (request, reply) => {
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: request.auth!.organizationId },
    });
    return reply.send({ organization });
  });

  fastify.patch(
    "/organization",
    { preHandler: fastify.requireRole(["owner", "admin"]) },
    async (request, reply) => {
      const organizationId = request.auth!.organizationId;
      const parsed = updateOrganizationSettingsSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "VALIDATION_ERROR", details: parsed.error.issues });
      }

      const before = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
      const organization = await prisma.organization.update({ where: { id: organizationId }, data: parsed.data });

      await recordAuditLog(prisma, {
        organizationId,
        actorUserId: request.auth!.userId,
        entityType: "organization_settings",
        entityId: organizationId,
        action: "update",
        before: before as never,
        after: organization as never,
      });

      return reply.send({ organization });
    },
  );

  fastify.get("/organization/users", async (request, reply) => {
    const organizationId = request.auth!.organizationId;
    const users = await prisma.user.findMany({
      where: { organizationId },
      select: { id: true, email: true, role: true, isActive: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    return reply.send({ users });
  });

  fastify.post(
    "/organization/users",
    { preHandler: fastify.requireRole(["owner", "admin"]) },
    async (request, reply) => {
      const organizationId = request.auth!.organizationId;
      const parsed = createTeamMemberSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "VALIDATION_ERROR", details: parsed.error.issues });
      }

      const existing = await prisma.user.findFirst({ where: { email: parsed.data.email } });
      if (existing) {
        return reply.code(409).send({ error: "EMAIL_ALREADY_REGISTERED" });
      }

      const user = await prisma.user.create({
        data: {
          organizationId,
          email: parsed.data.email,
          passwordHash: hashPassword(parsed.data.password),
          role: parsed.data.role,
        },
        select: { id: true, email: true, role: true, isActive: true, createdAt: true },
      });

      await recordAuditLog(prisma, {
        organizationId,
        actorUserId: request.auth!.userId,
        entityType: "user",
        entityId: user.id,
        action: "create",
        after: user as never,
      });

      return reply.code(201).send({ user });
    },
  );

  fastify.patch(
    "/organization/users/:id",
    { preHandler: fastify.requireRole(["owner", "admin"]) },
    async (request, reply) => {
      const organizationId = request.auth!.organizationId;
      const { id } = request.params as { id: string };
      const parsed = updateTeamMemberSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "VALIDATION_ERROR", details: parsed.error.issues });
      }

      const updated = await prisma.user.updateMany({ where: { id, organizationId }, data: parsed.data });
      if (updated.count === 0) return reply.code(404).send({ error: "USER_NOT_FOUND" });

      await recordAuditLog(prisma, {
        organizationId,
        actorUserId: request.auth!.userId,
        entityType: "user",
        entityId: id,
        action: "update",
        after: parsed.data as never,
      });

      return reply.send({ ok: true });
    },
  );
}
