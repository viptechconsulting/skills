import type { Prisma, PrismaClient } from "../../generated/client/index.js";

export function recordAuditLog(
  db: PrismaClient,
  args: {
    organizationId: string;
    actorUserId?: string;
    entityType: string;
    entityId: string;
    action: string;
    before?: Prisma.InputJsonValue;
    after?: Prisma.InputJsonValue;
  },
) {
  return db.auditLog.create({
    data: {
      organizationId: args.organizationId,
      actorUserId: args.actorUserId,
      entityType: args.entityType,
      entityId: args.entityId,
      action: args.action,
      before: args.before,
      after: args.after,
    },
  });
}

export function findAuditLogsByOrganization(db: PrismaClient, organizationId: string) {
  return db.auditLog.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } });
}
