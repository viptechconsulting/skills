import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { INTEGRATION_PROVIDERS } from "@lynkro-outbound/shared";
import { listConfiguredIntegrations, saveIntegrationCredential } from "@lynkro-outbound/domain";

const providerParamSchema = z.object({ provider: z.enum(INTEGRATION_PROVIDERS) });
const credentialBodySchema = z.record(z.string(), z.string().min(1));

export async function integrationRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.get("/integrations", async (request, reply) => {
    const organizationId = request.auth!.organizationId;
    const configured = await listConfiguredIntegrations(organizationId);
    return reply.send({ configured });
  });

  fastify.put(
    "/integrations/:provider",
    { preHandler: fastify.requireRole(["owner", "admin"]) },
    async (request, reply) => {
      const organizationId = request.auth!.organizationId;
      const paramsParsed = providerParamSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        return reply.code(400).send({ error: "INVALID_PROVIDER" });
      }
      const bodyParsed = credentialBodySchema.safeParse(request.body);
      if (!bodyParsed.success) {
        return reply.code(400).send({ error: "VALIDATION_ERROR", details: bodyParsed.error.issues });
      }

      await saveIntegrationCredential(organizationId, paramsParsed.data.provider, bodyParsed.data);
      // Nunca se devuelven las credenciales guardadas, ni siquiera cifradas.
      return reply.send({ ok: true, provider: paramsParsed.data.provider });
    },
  );
}
