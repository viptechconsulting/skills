import type { PrismaClient } from "../../generated/client/index.js";

export function isPhoneOnDoNotCallList(db: PrismaClient, organizationId: string, phoneE164: string) {
  return db.doNotCall.findFirst({ where: { organizationId, phoneE164 } }).then((r) => r !== null);
}

export function addToDoNotCallList(
  db: PrismaClient,
  organizationId: string,
  phoneE164: string,
  reason: string,
  source: string,
) {
  return db.doNotCall.upsert({
    where: { organizationId_phoneE164: { organizationId, phoneE164 } },
    update: { reason, source },
    create: { organizationId, phoneE164, reason, source },
  });
}

export function findDoNotCallByOrganization(db: PrismaClient, organizationId: string) {
  return db.doNotCall.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } });
}

export function removeFromDoNotCallScoped(db: PrismaClient, organizationId: string, id: string) {
  return db.doNotCall.deleteMany({ where: { id, organizationId } });
}
