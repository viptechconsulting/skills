import { prisma } from "@lynkro-outbound/db";

export interface CampaignAnalytics {
  scheduled: number;
  attempted: number;
  answeredByHuman: number;
  voicemails: number;
  realConversations: number;
  qualifiedProspects: number;
  appointmentsBooked: number;
  transfers: number;
  callbacksRequested: number;
  notInterested: number;
  doNotCallRequests: number;
  averageDurationSeconds: number | null;
  totalCostUsd: number;
  costPerConversationUsd: number | null;
  costPerAppointmentUsd: number | null;
}

const HUMAN_CONVERSATION_STATUSES = ["human_detected", "in_progress", "transferring", "completed"] as const;

export async function computeCampaignAnalytics(organizationId: string, campaignId: string): Promise<CampaignAnalytics> {
  const calls = await prisma.call.findMany({ where: { organizationId, campaignId } });

  const scheduled = calls.filter((c) => c.status === "scheduled" || c.status === "queued").length;
  const attempted = calls.filter((c) => c.status !== "draft" && c.status !== "eligibility_failed").length;

  // Importante: un buzón de voz NO es una conversación humana. Se cuentan
  // por separado para no inflar la tasa de conversación real.
  const voicemails = calls.filter((c) => c.outcome === "VOICEMAIL").length;
  const answeredByHuman = calls.filter((c) => HUMAN_CONVERSATION_STATUSES.includes(c.status as never)).length;
  const realConversations = calls.filter(
    (c) => HUMAN_CONVERSATION_STATUSES.includes(c.status as never) && c.outcome !== "VOICEMAIL",
  ).length;

  const qualifiedProspects = calls.filter((c) => c.outcome === "QUALIFIED_NOT_BOOKED" || c.outcome === "BOOKED").length;
  const appointmentsBooked = calls.filter((c) => c.outcome === "BOOKED").length;
  const transfers = calls.filter((c) => c.outcome === "TRANSFERRED").length;
  const callbacksRequested = calls.filter((c) => c.outcome === "CALLBACK_REQUESTED").length;
  const notInterested = calls.filter((c) => c.outcome === "NOT_INTERESTED").length;
  const doNotCallRequests = calls.filter((c) => c.outcome === "DO_NOT_CALL").length;

  const durations = calls.map((c) => c.durationSeconds).filter((d): d is number => d !== null && d !== undefined);
  const averageDurationSeconds = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : null;

  const totalCostUsd = calls.reduce((sum, c) => sum + (c.costUsd ? Number(c.costUsd) : 0), 0);
  const costPerConversationUsd = realConversations > 0 ? totalCostUsd / realConversations : null;
  const costPerAppointmentUsd = appointmentsBooked > 0 ? totalCostUsd / appointmentsBooked : null;

  return {
    scheduled,
    attempted,
    answeredByHuman,
    voicemails,
    realConversations,
    qualifiedProspects,
    appointmentsBooked,
    transfers,
    callbacksRequested,
    notInterested,
    doNotCallRequests,
    averageDurationSeconds,
    totalCostUsd,
    costPerConversationUsd,
    costPerAppointmentUsd,
  };
}

export async function computeOrganizationAnalytics(organizationId: string): Promise<CampaignAnalytics> {
  const campaigns = await prisma.campaign.findMany({ where: { organizationId }, select: { id: true } });
  const perCampaign = await Promise.all(campaigns.map((c) => computeCampaignAnalytics(organizationId, c.id)));

  return perCampaign.reduce<CampaignAnalytics>(
    (acc, curr) => ({
      scheduled: acc.scheduled + curr.scheduled,
      attempted: acc.attempted + curr.attempted,
      answeredByHuman: acc.answeredByHuman + curr.answeredByHuman,
      voicemails: acc.voicemails + curr.voicemails,
      realConversations: acc.realConversations + curr.realConversations,
      qualifiedProspects: acc.qualifiedProspects + curr.qualifiedProspects,
      appointmentsBooked: acc.appointmentsBooked + curr.appointmentsBooked,
      transfers: acc.transfers + curr.transfers,
      callbacksRequested: acc.callbacksRequested + curr.callbacksRequested,
      notInterested: acc.notInterested + curr.notInterested,
      doNotCallRequests: acc.doNotCallRequests + curr.doNotCallRequests,
      averageDurationSeconds: null,
      totalCostUsd: acc.totalCostUsd + curr.totalCostUsd,
      costPerConversationUsd: null,
      costPerAppointmentUsd: null,
    }),
    {
      scheduled: 0,
      attempted: 0,
      answeredByHuman: 0,
      voicemails: 0,
      realConversations: 0,
      qualifiedProspects: 0,
      appointmentsBooked: 0,
      transfers: 0,
      callbacksRequested: 0,
      notInterested: 0,
      doNotCallRequests: 0,
      averageDurationSeconds: null,
      totalCostUsd: 0,
      costPerConversationUsd: null,
      costPerAppointmentUsd: null,
    },
  );
}
