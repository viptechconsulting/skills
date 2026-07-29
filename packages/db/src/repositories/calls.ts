import type { CallStatus, Prisma, PrismaClient } from "../../generated/client/index.js";

export function findCallsByOrganization(
  db: PrismaClient,
  organizationId: string,
  args: { campaignId?: string; skip?: number; take?: number } = {},
) {
  return db.call.findMany({
    where: {
      organizationId,
      ...(args.campaignId ? { campaignId: args.campaignId } : {}),
    },
    orderBy: { createdAt: "desc" },
    skip: args.skip,
    take: args.take,
  });
}

export function findCallByIdScoped(db: PrismaClient, organizationId: string, callId: string) {
  return db.call.findFirst({
    where: { id: callId, organizationId },
    include: { events: { orderBy: { createdAt: "asc" } }, toolExecutions: { orderBy: { createdAt: "asc" } } },
  });
}

export function findActiveCallStatusesForProspect(
  db: PrismaClient,
  organizationId: string,
  prospectId: string,
  excludeCallId?: string,
): Promise<CallStatus[]> {
  return db.call
    .findMany({
      where: { organizationId, prospectId, ...(excludeCallId ? { id: { not: excludeCallId } } : {}) },
      select: { status: true },
    })
    .then((rows) => rows.map((r) => r.status));
}

export function updateCallScoped(
  db: PrismaClient,
  organizationId: string,
  callId: string,
  data: Prisma.CallUpdateInput,
) {
  return db.call.updateMany({ where: { id: callId, organizationId }, data });
}

/**
 * Inserta un CallEvent de forma idempotente: si ya existe un evento con la
 * misma idempotencyKey, no hace nada y devuelve el existente. Esto evita que
 * un webhook de Twilio reintentado procese la misma acción dos veces.
 */
export async function recordCallEventIdempotent(
  db: PrismaClient,
  args: { callId: string; type: string; payload: Prisma.InputJsonValue; causedBy: string; idempotencyKey: string },
) {
  const existing = await db.callEvent.findUnique({ where: { idempotencyKey: args.idempotencyKey } });
  if (existing) {
    return { created: false, event: existing };
  }
  const event = await db.callEvent.create({
    data: {
      callId: args.callId,
      type: args.type,
      payload: args.payload,
      causedBy: args.causedBy,
      idempotencyKey: args.idempotencyKey,
    },
  });
  return { created: true, event };
}
