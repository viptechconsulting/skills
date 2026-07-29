import type { Prisma, PrismaClient } from "../../generated/client/index.js";

export function findCampaignsByOrganization(db: PrismaClient, organizationId: string) {
  return db.campaign.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    include: { retryPolicies: true },
  });
}

export function findCampaignByIdScoped(db: PrismaClient, organizationId: string, campaignId: string) {
  return db.campaign.findFirst({
    where: { id: campaignId, organizationId },
    include: { retryPolicies: true },
  });
}

export function updateCampaignScoped(
  db: PrismaClient,
  organizationId: string,
  campaignId: string,
  data: Prisma.CampaignUpdateInput,
) {
  return db.campaign.updateMany({ where: { id: campaignId, organizationId }, data });
}
