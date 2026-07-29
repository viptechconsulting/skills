import { prisma, type IntegrationProvider } from "@lynkro-outbound/db";
import { decryptSecret, encryptSecret } from "@lynkro-outbound/shared";
import { domainEnv } from "./env.js";

export async function saveIntegrationCredential(
  organizationId: string,
  provider: IntegrationProvider,
  payload: Record<string, string>,
): Promise<void> {
  const encryptedPayload = encryptSecret(JSON.stringify(payload), domainEnv.ENCRYPTION_KEY);
  await prisma.integrationCredential.upsert({
    where: { organizationId_provider: { organizationId, provider } },
    update: { encryptedPayload, isActive: true },
    create: { organizationId, provider, encryptedPayload, isActive: true },
  });
}

export async function getIntegrationCredential<T>(
  organizationId: string,
  provider: IntegrationProvider,
): Promise<T | null> {
  const record = await prisma.integrationCredential.findUnique({
    where: { organizationId_provider: { organizationId, provider } },
  });
  if (!record || !record.isActive) return null;

  const decrypted = decryptSecret(record.encryptedPayload, domainEnv.ENCRYPTION_KEY);
  return JSON.parse(decrypted) as T;
}

export async function listConfiguredIntegrations(organizationId: string): Promise<IntegrationProvider[]> {
  const records = await prisma.integrationCredential.findMany({
    where: { organizationId, isActive: true },
    select: { provider: true },
  });
  return records.map((r) => r.provider);
}
