import { buildAdapterBundle, type AdapterBundle, type GhlCredentialPayload, type OpenAICredentialPayload, type TwilioCredentialPayload } from "@lynkro-outbound/adapters";
import { getIntegrationCredential } from "./integrationCredentialsService.js";

/**
 * Construye el bundle de adaptadores para una organización, respetando su
 * modo de simulación. Cuando simulationMode=true se ignoran las
 * credenciales reales por diseño (ver buildAdapterBundle).
 */
export async function getAdapterBundleForOrganization(
  organizationId: string,
  simulationMode: boolean,
): Promise<AdapterBundle> {
  if (simulationMode) {
    return buildAdapterBundle({ simulationMode: true });
  }

  const [twilioCreds, openaiCreds, ghlCreds] = await Promise.all([
    getIntegrationCredential<TwilioCredentialPayload>(organizationId, "twilio"),
    getIntegrationCredential<OpenAICredentialPayload>(organizationId, "openai"),
    getIntegrationCredential<GhlCredentialPayload>(organizationId, "gohighlevel"),
  ]);

  return buildAdapterBundle({
    simulationMode: false,
    twilio: twilioCreds ?? undefined,
    openai: openaiCreds ?? undefined,
    ghl: ghlCreds ?? undefined,
  });
}
