import { prisma } from "@lynkro-outbound/db";
import type { CallDispatchJob } from "@lynkro-outbound/shared";
import { checkProspectEligibility, getAdapterBundleForOrganization, transitionCall } from "@lynkro-outbound/domain";
import { env } from "../config.js";
import { logger } from "../lib/logger.js";
import { runSimulatedCall } from "../simulation/simulationCallRunner.js";

/**
 * Procesa un job de despacho de llamada. Vuelve a evaluar elegibilidad de
 * forma determinística (nunca confía en la evaluación hecha al momento de
 * encolar, porque el tiempo transcurrido pudo invalidarla) antes de
 * originar la llamada real o, en modo simulación, ejecutar el guion
 * simulado de punta a punta.
 */
export async function processCallDispatch(job: CallDispatchJob): Promise<void> {
  const call = await prisma.call.findFirst({ where: { id: job.callId, organizationId: job.organizationId } });
  if (!call) {
    logger.warn({ callId: job.callId }, "call_dispatch_call_not_found");
    return;
  }
  if (call.status !== "queued") {
    logger.warn({ callId: job.callId, status: call.status }, "call_dispatch_skipped_not_queued");
    return;
  }

  const eligibility = await checkProspectEligibility(job.organizationId, call.prospectId, {
    excludeCallId: call.id,
  });
  if (!eligibility || !eligibility.result.eligible) {
    await transitionCall({
      organizationId: job.organizationId,
      callId: call.id,
      toStatus: "eligibility_failed",
      causedBy: "worker-eligibility-recheck",
      payload: { reason: eligibility?.result.reason },
    });
    await prisma.call.update({
      where: { id: call.id },
      data: { eligibilityRejectionReason: eligibility?.result.reason ?? "UNKNOWN" },
    });
    return;
  }

  const { campaign, prospect } = eligibility;
  const adapters = await getAdapterBundleForOrganization(job.organizationId, campaign.simulationMode);

  await transitionCall({ organizationId: job.organizationId, callId: call.id, toStatus: "dialing", causedBy: "worker" });

  if (campaign.simulationMode) {
    await runSimulatedCall({ call, campaign, prospect, adapters });
    return;
  }

  const phoneNumber = await prisma.phoneNumber.findUniqueOrThrow({ where: { id: campaign.outboundPhoneNumberId } });
  const base = env.TWILIO_WEBHOOK_BASE_URL;

  try {
    const originateResult = await adapters.telephony.originateCall({
      toE164: prospect.phoneE164,
      fromE164: phoneNumber.e164,
      answerWebhookUrl: `${base}/webhooks/twilio/voice-answer/${call.id}`,
      statusCallbackUrl: `${base}/webhooks/twilio/voice-status`,
      machineDetectionCallbackUrl: `${base}/webhooks/twilio/amd`,
      recordingEnabled: campaign.recordingEnabled,
      recordingStatusCallbackUrl: campaign.recordingEnabled ? `${base}/webhooks/twilio/recording` : undefined,
    });

    await prisma.call.update({ where: { id: call.id }, data: { providerCallSid: originateResult.providerCallSid } });
    await transitionCall({ organizationId: job.organizationId, callId: call.id, toStatus: "initiated", causedBy: "worker" });
    await prisma.prospect.update({ where: { id: prospect.id }, data: { status: "in_progress" } });
  } catch (error) {
    logger.error({ err: (error as Error).message, callId: call.id }, "call_originate_failed");
    await transitionCall({
      organizationId: job.organizationId,
      callId: call.id,
      toStatus: "failed",
      causedBy: "worker-originate-error",
    }).catch(() => undefined);
    await prisma.call.update({ where: { id: call.id }, data: { outcome: "FAILED" } });
  }
}
