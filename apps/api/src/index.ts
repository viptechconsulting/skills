import { buildServer } from "./server.js";
import { env } from "./config.js";
import { logger } from "./lib/logger.js";

async function main(): Promise<void> {
  const app = await buildServer();
  await app.listen({ port: env.PORT_API, host: "0.0.0.0" });
  logger.info({ port: env.PORT_API, simulationMode: env.SIMULATION_MODE }, "lynkro_outbound_api_started");
}

main().catch((error) => {
  console.error("Error fatal al iniciar apps/api:", error);
  process.exit(1);
});
