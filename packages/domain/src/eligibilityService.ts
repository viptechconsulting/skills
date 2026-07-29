import {
  prisma,
  findActiveCallStatusesForProspect,
  isPhoneOnDoNotCallList,
  findFutureActiveAppointment,
} from "@lynkro-outbound/db";
import { evaluateCallEligibility, type EligibilityResult } from "@lynkro-outbound/shared";

export interface CheckEligibilityOptions {
  evaluateAt?: Date;
  /**
   * Id de una llamada a excluir del chequeo de "llamada activa en curso".
   * Se usa cuando se re-valida elegibilidad para una llamada que ya existe
   * en estado queued/dialing (p. ej. el re-chequeo del worker antes de
   * originar la llamada): esa misma llamada no debe contarse como un
   * duplicado activo de sí misma.
   */
  excludeCallId?: string;
}

/**
 * Reúne todos los datos necesarios de la base de datos y ejecuta el motor
 * de elegibilidad puro de packages/shared. Esta es la ÚNICA función que
 * debe llamarse antes de encolar o marcar como "queued" una llamada — el
 * worker y el endpoint "llamar ahora" comparten esta misma ruta.
 */
export async function checkProspectEligibility(
  organizationId: string,
  prospectId: string,
  options: Date | CheckEligibilityOptions = {},
): Promise<{ result: EligibilityResult; prospect: NonNullable<Awaited<ReturnType<typeof prisma.prospect.findFirst>>>; campaign: NonNullable<Awaited<ReturnType<typeof prisma.campaign.findFirst>>> } | null> {
  const opts: CheckEligibilityOptions = options instanceof Date ? { evaluateAt: options } : options;
  const evaluateAt = opts.evaluateAt ?? new Date();

  const prospect = await prisma.prospect.findFirst({ where: { id: prospectId, organizationId } });
  if (!prospect) return null;

  const campaign = prospect.campaignId
    ? await prisma.campaign.findFirst({ where: { id: prospect.campaignId, organizationId } })
    : null;
  if (!campaign) return null;

  const [isOnDnc, activeCallStatuses, futureAppointment] = await Promise.all([
    isPhoneOnDoNotCallList(prisma, organizationId, prospect.phoneE164),
    findActiveCallStatusesForProspect(prisma, organizationId, prospectId, opts.excludeCallId),
    findFutureActiveAppointment(prisma, organizationId, prospectId),
  ]);

  const result = evaluateCallEligibility({
    phoneE164: prospect.phoneE164,
    consentRequired: campaign.consentRequired,
    consentGiven: prospect.consentGiven,
    isOnDoNotCallList: isOnDnc,
    isProspectBlocked: prospect.isBlocked,
    campaignStatus: campaign.status,
    prospectTimezone: prospect.timezone,
    allowedWindow: { start: campaign.allowedWindowStart, end: campaign.allowedWindowEnd },
    attemptCount: prospect.attemptCount,
    maxAttempts: campaign.maxAttempts,
    activeCallStatuses,
    hasFutureActiveAppointment: futureAppointment !== null,
    evaluateAt,
  });

  return { result, prospect, campaign };
}
