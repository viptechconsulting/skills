import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import cookie from "@fastify/cookie";
import { env } from "../config.js";

async function securityPlugin(fastify: FastifyInstance): Promise<void> {
  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: "same-site" },
  });

  const allowedOrigins = env.CORS_ALLOWED_ORIGINS.split(",").map((s) => s.trim());
  await fastify.register(cors, {
    origin: allowedOrigins,
    credentials: true,
  });

  await fastify.register(cookie, {
    secret: env.JWT_SECRET,
    hook: "onRequest",
  });

  await fastify.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
    allowList: [],
    ban: 0,
  });

  fastify.addHook("onSend", async (_request, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    return payload;
  });
}

export default fp(securityPlugin, { name: "security-plugin" });
