import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { QUEUE_NAMES, type CallDispatchJob } from "@lynkro-outbound/shared";
import { env } from "../config.js";

export const redisConnection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

export const callDispatchQueue = new Queue<CallDispatchJob>(QUEUE_NAMES.callDispatch, {
  connection: redisConnection,
});

export async function enqueueCallDispatch(job: CallDispatchJob, delayMs = 0): Promise<void> {
  await callDispatchQueue.add(QUEUE_NAMES.callDispatch, job, {
    delay: delayMs,
    attempts: 1,
    removeOnComplete: 500,
    removeOnFail: 500,
  });
}
