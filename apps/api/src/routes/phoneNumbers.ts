import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@lynkro-outbound/db";
import { e164Schema } from "@lynkro-outbound/shared";

const createPhoneNumberSchema = z.object({
  e164: e164Schema,
  label: z.string().min(1).max(200),
});

export async function phoneNumberRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.get("/phone-numbers", async (request, reply) => {
    const organizationId = request.auth!.organizationId;
    const phoneNumbers = await prisma.phoneNumber.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } });
    return reply.send({ phoneNumbers });
  });

  fastify.post("/phone-numbers", { preHandler: fastify.requireRole(["owner", "admin"]) }, async (request, reply) => {
    const organizationId = request.auth!.organizationId;
    const parsed = createPhoneNumberSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "VALIDATION_ERROR", details: parsed.error.issues });
    }
    const phoneNumber = await prisma.phoneNumber.create({
      data: { organizationId, e164: parsed.data.e164, label: parsed.data.label },
    });
    return reply.code(201).send({ phoneNumber });
  });
}
