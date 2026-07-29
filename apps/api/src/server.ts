import Fastify, { type FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import websocketPlugin from "@fastify/websocket";
import { randomUUID } from "node:crypto";
import { env } from "./config.js";
import securityPlugin from "./plugins/security.js";
import authPlugin from "./plugins/auth.js";
import { authRoutes } from "./routes/auth.js";
import { campaignRoutes } from "./routes/campaigns.js";
import { prospectRoutes } from "./routes/prospects.js";
import { callRoutes } from "./routes/calls.js";
import { dncRoutes } from "./routes/dnc.js";
import { phoneNumberRoutes } from "./routes/phoneNumbers.js";
import { voiceAgentRoutes } from "./routes/voiceAgents.js";
import { integrationRoutes } from "./routes/integrations.js";
import { analyticsRoutes } from "./routes/analytics.js";
import { twilioWebhookRoutes } from "./routes/webhooksTwilio.js";
import { registerTwilioMediaBridge } from "./ws/twilioMediaBridge.js";

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "*.password",
          "*.token",
          "*.secret",
          "*.authToken",
          "*.apiKey",
          "*.accessToken",
        ],
        censor: "[REDACTED]",
      },
    },
    genReqId: () => randomUUID(),
    bodyLimit: 5 * 1024 * 1024,
    trustProxy: true,
  });

  await app.register(securityPlugin);
  await app.register(authPlugin);
  await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } });
  await app.register(websocketPlugin);

  app.get("/health", async () => ({ ok: true, service: "lynkro-outbound-api" }));

  await app.register(authRoutes);
  await app.register(campaignRoutes);
  await app.register(prospectRoutes);
  await app.register(callRoutes);
  await app.register(dncRoutes);
  await app.register(phoneNumberRoutes);
  await app.register(voiceAgentRoutes);
  await app.register(integrationRoutes);
  await app.register(analyticsRoutes);
  await app.register(twilioWebhookRoutes);

  registerTwilioMediaBridge(app);

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error.message }, "unhandled_error");
    const statusCode = error.statusCode ?? 500;
    reply.code(statusCode).send({ error: statusCode === 500 ? "INTERNAL_ERROR" : error.message });
  });

  return app;
}
