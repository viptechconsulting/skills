import { prisma } from "@lynkro-outbound/db";
import { checkProspectEligibility } from "@lynkro-outbound/domain";
import { QUEUE_NAMES, type CallDispatchJob } from "@lynkro-outbound/shared";
import { callDispatchQueue } from "../lib/queues.js";
import { logger } from "../lib/logger.js";

/**
 * Job periódico: busca prospectos listos para su próximo intento — ya sea
 * "new" recién asignados a una campaña (primer intento, sin fecha propia) o
 * "scheduled" por un reintento/programación manual cuyo nextAttemptAt ya
 * venció — vuelve a validar elegibilidad y, si corresponde, crea la llamada
 * y la encola. Esto es lo que permite que una importación masiva por CSV
 * asignada a una campaña activa se marque sola, sin acción manual por
 * prospecto. Nunca marca una llamada como elegible sin pasar por el motor de
 * elegibilidad — el mero vencimiento del temporizador no es suficiente.
 */
export async function processCallMaintenance(): Promise<{ scanned: number; enqueued: number }> {
  const now = new Date();
  const dueProspects = await prisma.prospect.findMany({
    where: {
      isBlocked: false,
      campaignId: { not: null },
      OR: [{ status: "new" }, { status: "scheduled", nextAttemptAt: { lte: now } }],
    },
    take: 200,
  });

  let enqueued = 0;

  for (const prospect of dueProspects) {
    const eligibility = await checkProspectEligibility(prospect.organizationId, prospect.id, now);
    if (!eligibility || !eligibility.result.eligible) {
      logger.info(
        { prospectId: prospect.id, reason: eligibility?.result.reason },
        "call_maintenance_prospect_not_eligible",
      );
      continue;
    }

    const { campaign } = eligibility;
    const call = await prisma.call.create({
      data: {
        organizationId: prospect.organizationId,
        campaignId: campaign.id,
        prospectId: prospect.id,
        phoneNumberId: campaign.outboundPhoneNumberId,
        status: "queued",
        attemptNumber: prospect.attemptCount + 1,
        simulation: campaign.simulationMode,
      },
    });

    await prisma.prospect.update({ where: { id: prospect.id }, data: { status: "queued" } });

    const job: CallDispatchJob = { callId: call.id, organizationId: prospect.organizationId, reason: "scheduled" };
    await callDispatchQueue.add(QUEUE_NAMES.callDispatch, job, {
      attempts: 1,
      removeOnComplete: 500,
      removeOnFail: 500,
    });
    enqueued += 1;
  }

  return { scanned: dueProspects.length, enqueued };
}
