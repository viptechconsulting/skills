import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { prisma } from "@lynkro-outbound/db";
import { hashPassword, loginSchema, registerSchema, verifyPassword } from "@lynkro-outbound/shared";
import { signSessionToken } from "../lib/jwt.js";
import { env } from "../config.js";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 12,
};

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post("/auth/register", async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "VALIDATION_ERROR", details: parsed.error.issues });
    }
    const { organizationName, email, password, timezoneDefault } = parsed.data;

    const existing = await prisma.user.findFirst({ where: { email } });
    if (existing) {
      return reply.code(409).send({ error: "EMAIL_ALREADY_REGISTERED" });
    }

    const organization = await prisma.organization.create({
      data: { name: organizationName, timezoneDefault },
    });
    const user = await prisma.user.create({
      data: {
        organizationId: organization.id,
        email,
        passwordHash: hashPassword(password),
        role: "owner",
      },
    });

    const session = await prisma.session.create({
      data: {
        userId: user.id,
        refreshToken: randomUUID(),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      },
    });

    const token = signSessionToken({
      userId: user.id,
      organizationId: organization.id,
      role: user.role,
      sessionId: session.id,
    });

    reply.setCookie(env.SESSION_COOKIE_NAME, token, COOKIE_OPTIONS);
    return reply.code(201).send({ organizationId: organization.id, userId: user.id });
  });

  fastify.post("/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "VALIDATION_ERROR", details: parsed.error.issues });
    }
    const { email, password } = parsed.data;

    const user = await prisma.user.findFirst({ where: { email, isActive: true } });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return reply.code(401).send({ error: "INVALID_CREDENTIALS" });
    }

    const session = await prisma.session.create({
      data: {
        userId: user.id,
        refreshToken: randomUUID(),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      },
    });

    const token = signSessionToken({
      userId: user.id,
      organizationId: user.organizationId,
      role: user.role,
      sessionId: session.id,
    });

    reply.setCookie(env.SESSION_COOKIE_NAME, token, COOKIE_OPTIONS);
    return reply.send({ organizationId: user.organizationId, userId: user.id, role: user.role });
  });

  fastify.post("/auth/logout", { preHandler: fastify.authenticate }, async (request, reply) => {
    if (request.auth) {
      await prisma.session.updateMany({
        where: { id: request.auth.sessionId },
        data: { revokedAt: new Date() },
      });
    }
    reply.clearCookie(env.SESSION_COOKIE_NAME, { path: "/" });
    return reply.send({ ok: true });
  });

  fastify.get("/auth/me", { preHandler: fastify.authenticate }, async (request, reply) => {
    const user = await prisma.user.findUnique({ where: { id: request.auth!.userId } });
    if (!user) return reply.code(404).send({ error: "USER_NOT_FOUND" });
    return reply.send({
      userId: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    });
  });
}
