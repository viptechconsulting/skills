import { randomUUID } from "node:crypto";
import {
  prisma,
  recordCallEventIdempotent,
  type Call,
  type CallStatus,
} from "@lynkro-outbound/db";
import { assertValidTransition } from "@lynkro-outbound/shared";

export interface TransitionCallInput {
  organizationId: string;
  callId: string;
  toStatus: CallStatus;
  causedBy: string;
  payload?: Record<string, unknown>;
  /** Si se omite, se genera uno aleatorio (transición interna, no de webhook). */
  idempotencyKey?: string;
}

export class CallNotFoundError extends Error {
  constructor(callId: string) {
    super(`Llamada no encontrada: ${callId}`);
    this.name = "CallNotFoundError";
  }
}

/**
 * Transiciona una llamada a un nuevo estado, validando la máquina de
 * estados y registrando un CallEvent idempotente. Es el único punto por el
 * que debe cambiar Call.status en toda la aplicación.
 */
export async function transitionCall(input: TransitionCallInput): Promise<Call> {
  const call = await prisma.call.findFirst({ where: { id: input.callId, organizationId: input.organizationId } });
  if (!call) throw new CallNotFoundError(input.callId);

  assertValidTransition(call.status, input.toStatus);

  const idempotencyKey = input.idempotencyKey ?? randomUUID();

  const { created } = await recordCallEventIdempotent(prisma, {
    callId: call.id,
    type: `transition:${call.status}->${input.toStatus}`,
    payload: (input.payload ?? {}) as never,
    causedBy: input.causedBy,
    idempotencyKey,
  });

  if (!created) {
    // Evento duplicado (mismo webhook reintentado): no repetir la transición.
    return call;
  }

  const updated = await prisma.call.update({
    where: { id: call.id },
    data: {
      status: input.toStatus,
      ...(input.toStatus === "in_progress" && !call.startedAt ? { startedAt: new Date() } : {}),
      ...(["completed", "no_answer", "busy", "failed", "canceled", "blocked"].includes(input.toStatus)
        ? { endedAt: new Date() }
        : {}),
    },
  });

  return updated;
}
