import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import type { UserRole } from "@lynkro-outbound/shared";
import { verifySessionToken } from "../lib/jwt.js";
import { env } from "../config.js";

export interface AuthContext {
  userId: string;
  organizationId: string;
  role: UserRole;
  sessionId: string;
}

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

async function authPlugin(fastify: FastifyInstance): Promise<void> {
  fastify.decorateRequest("auth", undefined);

  fastify.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.cookies[env.SESSION_COOKIE_NAME];
    if (!token) {
      return reply.code(401).send({ error: "NOT_AUTHENTICATED" });
    }
    try {
      const payload = verifySessionToken(token);
      request.auth = {
        userId: payload.userId,
        organizationId: payload.organizationId,
        role: payload.role,
        sessionId: payload.sessionId,
      };
    } catch {
      return reply.code(401).send({ error: "INVALID_SESSION" });
    }
  });

  fastify.decorate("requireRole", (roles: UserRole[]) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.auth) {
        return reply.code(401).send({ error: "NOT_AUTHENTICATED" });
      }
      if (!roles.includes(request.auth.role)) {
        return reply.code(403).send({ error: "FORBIDDEN" });
      }
    };
  });
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (roles: UserRole[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export default fp(authPlugin, { name: "auth-plugin" });
