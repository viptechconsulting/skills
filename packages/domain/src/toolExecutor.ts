import {
  prisma,
  createAppointmentIfNoOverlap,
  addToDoNotCallList,
  cancelAppointmentScoped,
} from "@lynkro-outbound/db";
import { AGENT_TOOL_SCHEMAS, type AgentToolName } from "@lynkro-outbound/shared";
import type { AdapterBundle } from "@lynkro-outbound/adapters";
import { transitionCall } from "./callOrchestrator.js";
import { logger } from "./logger.js";

export interface ToolExecutionContext {
  organizationId: string;
  callId: string;
  adapters: AdapterBundle;
}

export interface ToolExecutionOutcome {
  authorized: boolean;
  result?: unknown;
  errorMessage?: string;
}

/**
 * Ejecuta una herramienta solicitada por el modelo. SIEMPRE valida
 * argumentos con Zod, aplica autorización específica de la herramienta,
 * registra auditoría (CallToolExecution) y solo entonces llama al
 * adaptador externo correspondiente. El modelo nunca toca un proveedor
 * externo directamente.
 */
export async function executeAgentTool(
  context: ToolExecutionContext,
  toolName: string,
  rawArgs: unknown,
): Promise<ToolExecutionOutcome> {
  if (!(toolName in AGENT_TOOL_SCHEMAS)) {
    return recordAndReturn(context, toolName, rawArgs, { authorized: false, errorMessage: "UNKNOWN_TOOL" });
  }

  const schema = AGENT_TOOL_SCHEMAS[toolName as AgentToolName];
  const parsed = schema.safeParse(rawArgs);
  if (!parsed.success) {
    return recordAndReturn(context, toolName, rawArgs, {
      authorized: false,
      errorMessage: `INVALID_ARGS: ${parsed.error.message}`,
    });
  }

  const call = await prisma.call.findFirst({
    where: { id: context.callId, organizationId: context.organizationId },
  });
  if (!call) {
    return recordAndReturn(context, toolName, rawArgs, { authorized: false, errorMessage: "CALL_NOT_FOUND" });
  }

  const campaign = await prisma.campaign.findFirst({ where: { id: call.campaignId } });
  const prospect = await prisma.prospect.findFirst({ where: { id: call.prospectId } });
  if (!campaign || !prospect) {
    return recordAndReturn(context, toolName, rawArgs, { authorized: false, errorMessage: "CALL_CONTEXT_MISSING" });
  }

  try {
    const outcome = await dispatch(toolName as AgentToolName, parsed.data as never, {
      context,
      campaign,
      prospect,
    });
    return recordAndReturn(context, toolName, rawArgs, { authorized: true, result: outcome });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    logger.error({ err: message, toolName, callId: context.callId }, "tool_execution_failed");
    return recordAndReturn(context, toolName, rawArgs, { authorized: true, errorMessage: message });
  }
}

interface DispatchDeps {
  context: ToolExecutionContext;
  campaign: Awaited<ReturnType<typeof prisma.campaign.findFirst>>;
  prospect: Awaited<ReturnType<typeof prisma.prospect.findFirst>>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function dispatch(toolName: AgentToolName, args: any, deps: DispatchDeps): Promise<unknown> {
  const { context, campaign, prospect } = deps;
  if (!campaign || !prospect) throw new Error("CALL_CONTEXT_MISSING");

  switch (toolName) {
    case "get_calendar_availability": {
      if (!campaign.targetCalendarId) throw new Error("NO_CALENDAR_CONFIGURED");
      const slots = await context.adapters.calendar.getAvailability({
        calendarId: campaign.targetCalendarId,
        earliestStartUtc: args.earliestStartUtc,
        durationMinutes: args.durationMinutes,
      });
      // Regla de negocio: nunca ofrecer más de dos horarios a la vez.
      return { slots: slots.slice(0, 2) };
    }

    case "book_appointment": {
      if (!campaign.targetCalendarId) throw new Error("NO_CALENDAR_CONFIGURED");
      const crmContact = await context.adapters.crm.getContactByPhone(prospect.phoneE164);
      const dbResult = await createAppointmentIfNoOverlap(prisma, {
        organizationId: context.organizationId,
        prospectId: prospect.id,
        callId: context.callId,
        startsAt: args.confirmedSlot.startUtc,
        endsAt: args.confirmedSlot.endUtc,
        timezone: args.timezone,
      });
      if (!dbResult.ok) {
        return { booked: false, reason: dbResult.reason };
      }
      const providerResult = await context.adapters.calendar.bookAppointment({
        calendarId: campaign.targetCalendarId,
        contactId: crmContact?.id ?? prospect.id,
        startUtc: args.confirmedSlot.startUtc,
        endUtc: args.confirmedSlot.endUtc,
        timezone: args.timezone,
        title: `${campaign.name} — ${prospect.name}`,
      });
      await prisma.appointment.update({
        where: { id: dbResult.appointment.id },
        data: { ghlAppointmentId: providerResult.appointmentId, status: "confirmed" },
      });
      if (crmContact) {
        await context.adapters.crm.addNote(
          crmContact.id,
          `Cita agendada vía Lynkro Outbound para ${args.confirmedSlot.startUtc.toISOString()} (${args.timezone}). ${args.notes ?? ""}`,
        );
      }
      return { booked: true, appointmentId: dbResult.appointment.id };
    }

    case "reschedule_appointment": {
      await context.adapters.calendar.rescheduleAppointment({
        appointmentId: args.appointmentId,
        newStartUtc: args.newSlot.startUtc,
        newEndUtc: args.newSlot.endUtc,
      });
      return { rescheduled: true };
    }

    case "cancel_appointment": {
      await context.adapters.calendar.cancelAppointment(args.appointmentId);
      await cancelAppointmentScoped(prisma, context.organizationId, args.appointmentId);
      return { canceled: true };
    }

    case "get_crm_contact": {
      const contact = await context.adapters.crm.getContactByPhone(prospect.phoneE164);
      return { contact };
    }

    case "update_crm_contact": {
      const contact = await context.adapters.crm.getContactByPhone(prospect.phoneE164);
      if (!contact) throw new Error("CRM_CONTACT_NOT_FOUND");
      await context.adapters.crm.updateContact(contact.id, args.fields);
      return { updated: true };
    }

    case "create_opportunity": {
      const contact = await context.adapters.crm.getContactByPhone(prospect.phoneE164);
      if (!contact) throw new Error("CRM_CONTACT_NOT_FOUND");
      const result = await context.adapters.crm.createOpportunity({
        contactId: contact.id,
        pipelineStageId: args.pipelineStage,
        name: args.name,
        value: args.value,
      });
      return result;
    }

    case "move_opportunity_stage": {
      await context.adapters.crm.moveOpportunityStage(args.opportunityId, args.newStage);
      return { moved: true };
    }

    case "add_call_note": {
      const contact = await context.adapters.crm.getContactByPhone(prospect.phoneE164);
      if (contact) {
        await context.adapters.crm.addNote(contact.id, args.note);
      }
      return { noted: true };
    }

    case "send_confirmation_sms": {
      const phoneNumber = await prisma.phoneNumber.findUnique({ where: { id: campaign.outboundPhoneNumberId } });
      if (!phoneNumber) throw new Error("NO_OUTBOUND_NUMBER_CONFIGURED");
      const result = await context.adapters.messaging.sendSms({
        toE164: prospect.phoneE164,
        fromE164: phoneNumber.e164,
        body: args.message,
      });
      return result;
    }

    case "send_follow_up_sms": {
      const phoneNumber = await prisma.phoneNumber.findUnique({ where: { id: campaign.outboundPhoneNumberId } });
      if (!phoneNumber) throw new Error("NO_OUTBOUND_NUMBER_CONFIGURED");
      const result = await context.adapters.messaging.sendSms({
        toE164: prospect.phoneE164,
        fromE164: phoneNumber.e164,
        body: args.message,
      });
      return result;
    }

    case "schedule_callback": {
      await prisma.prospect.update({
        where: { id: prospect.id },
        data: { nextAttemptAt: args.callbackAtUtc, status: "scheduled" },
      });
      return { scheduled: true };
    }

    case "transfer_to_human": {
      if (!campaign.transferToPhoneNumber) {
        return { transferred: false, reason: "NO_HUMAN_NUMBER_CONFIGURED" };
      }
      const currentCall = await prisma.call.findUniqueOrThrow({ where: { id: context.callId } });
      if (!currentCall.providerCallSid) throw new Error("CALL_NOT_ACTIVE");
      const result = await context.adapters.telephony.transferCall({
        providerCallSid: currentCall.providerCallSid,
        transferToE164: campaign.transferToPhoneNumber,
      });
      if (result.ok) {
        await transitionCall({
          organizationId: context.organizationId,
          callId: context.callId,
          toStatus: "transferring",
          causedBy: "tool:transfer_to_human",
        });
      }
      return result;
    }

    case "mark_do_not_call": {
      await addToDoNotCallList(prisma, context.organizationId, prospect.phoneE164, args.reason, "prospect_request");
      await prisma.prospect.update({
        where: { id: prospect.id },
        data: { status: "do_not_call", isBlocked: true, nextAttemptAt: null },
      });
      return { markedDoNotCall: true };
    }

    case "end_call": {
      await prisma.call.update({
        where: { id: context.callId },
        data: {
          outcome: args.outcome,
          summary: args.summary,
          nextStep: args.nextStep,
        },
      });
      await prisma.prospect.update({
        where: { id: prospect.id },
        data: { finalOutcome: args.outcome },
      });
      return { ended: true };
    }

    default: {
      const _exhaustive: never = toolName;
      throw new Error(`Herramienta no manejada: ${_exhaustive}`);
    }
  }
}

async function recordAndReturn(
  context: ToolExecutionContext,
  toolName: string,
  rawArgs: unknown,
  outcome: ToolExecutionOutcome,
): Promise<ToolExecutionOutcome> {
  await prisma.callToolExecution.create({
    data: {
      callId: context.callId,
      toolName,
      args: rawArgs as never,
      result: (outcome.result as never) ?? undefined,
      authorized: outcome.authorized,
      errorMessage: outcome.errorMessage,
    },
  });
  return outcome;
}
