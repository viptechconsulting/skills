import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { callDispatchJobSchema, callMaintenanceJobSchema, QUEUE_NAMES } from "@lynkro-outbound/shared";
import { env } from "./config.js";
import { callMaintenanceQueue } from "./lib/queues.js";
import { logger } from "./lib/logger.js";
import { processCallDispatch } from "./processors/callDispatchProcessor.js";
import { processCallMaintenance } from "./processors/callMaintenanceProcessor.js";

const MAINTENANCE_INTERVAL_MS = 60_000;

async function main(): Promise<void> {
  // Cada Worker de BullMQ necesita su propia conexión dedicada: usan
  // comandos bloqueantes de Redis para esperar nuevos jobs, y compartir una
  // sola conexión entre dos Workers hace que uno acapare la conexión y el
  // otro nunca reciba jobs (sin ningún error visible en los logs).
  const dispatchWorker = new Worker(
    QUEUE_NAMES.callDispatch,
    async (job) => {
      const data = callDispatchJobSchema.parse(job.data);
      await processCallDispatch(data);
    },
    { connection: new Redis(env.REDIS_URL, { maxRetriesPerRequest: null }), concurrency: 5 },
  );

  const maintenanceWorker = new Worker(
    QUEUE_NAMES.callMaintenance,
    async (job) => {
      callMaintenanceJobSchema.parse(job.data);
      const result = await processCallMaintenance();
      logger.info(result, "call_maintenance_run_completed");
    },
    { connection: new Redis(env.REDIS_URL, { maxRetriesPerRequest: null }), concurrency: 1 },
  );

  dispatchWorker.on("failed", (job, error) => {
    logger.error({ err: error.message, jobId: job?.id }, "call_dispatch_job_failed");
  });
  dispatchWorker.on("error", (error) => {
    logger.error({ err: error.message }, "call_dispatch_worker_error");
  });
  maintenanceWorker.on("failed", (job, error) => {
    logger.error({ err: error.message, jobId: job?.id }, "call_maintenance_job_failed");
  });
  maintenanceWorker.on("error", (error) => {
    logger.error({ err: error.message }, "call_maintenance_worker_error");
  });

  await callMaintenanceQueue.add(
    "scan",
    { triggeredBy: "cron" },
    {
      repeat: { every: MAINTENANCE_INTERVAL_MS },
      jobId: "call-maintenance-repeat",
      removeOnComplete: 10,
      removeOnFail: 10,
    },
  );

  logger.info({ maintenanceIntervalMs: MAINTENANCE_INTERVAL_MS }, "lynkro_outbound_worker_started");

  const shutdown = async () => {
    logger.info({}, "worker_shutting_down");
    await Promise.all([dispatchWorker.close(), maintenanceWorker.close()]);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("Error fatal al iniciar apps/worker:", error);
  process.exit(1);
});
