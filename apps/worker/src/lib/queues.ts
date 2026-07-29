import { Queue } from "bullmq";
import { QUEUE_NAMES, type CallDispatchJob } from "@lynkro-outbound/shared";
import { redisConnection } from "./redis.js";

export const callDispatchQueue = new Queue<CallDispatchJob>(QUEUE_NAMES.callDispatch, {
  connection: redisConnection,
});

export const callMaintenanceQueue = new Queue(QUEUE_NAMES.callMaintenance, {
  connection: redisConnection,
});
