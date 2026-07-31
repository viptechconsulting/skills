import { z } from "zod";

/**
 * Nombres de colas BullMQ compartidos entre apps/api (productor) y
 * apps/worker (consumidor). Mantenerlos en un solo lugar evita que ambos
 * lados diverjan en el nombre de cola o la forma del payload.
 */
export const QUEUE_NAMES = {
  callDispatch: "call-dispatch",
  callMaintenance: "call-maintenance",
} as const;

export const callDispatchJobSchema = z.object({
  callId: z.string().uuid(),
  organizationId: z.string().uuid(),
  reason: z.enum(["manual", "scheduled", "retry", "test"]),
});
export type CallDispatchJob = z.infer<typeof callDispatchJobSchema>;

/** Job periódico: escanea prospectos con nextAttemptAt vencido y los encola. */
export const callMaintenanceJobSchema = z.object({
  triggeredBy: z.enum(["cron", "manual"]),
});
export type CallMaintenanceJob = z.infer<typeof callMaintenanceJobSchema>;
