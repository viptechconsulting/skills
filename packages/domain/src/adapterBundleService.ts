import {
  buildAdapterBundle,
  type AdapterBundle,
  type ElevenLabsCredentialPayload,
  type GhlCredentialPayload,
  type OpenAICredentialPayload,
  type TwilioCredentialPayload,
} from "@lynkro-outbound/adapters";
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

  const [twilioCreds, openaiCreds, ghlCreds, elevenLabsCreds] = await Promise.all([
    getIntegrationCredential<TwilioCredentialPayload>(organizationId, "twilio"),
    getIntegrationCredential<OpenAICredentialPayload>(organizationId, "openai"),
    getIntegrationCredential<GhlCredentialPayload>(organizationId, "gohighlevel"),
    // A diferencia de twilio/openai/ghl, ElevenLabs es opcional: no todos
    // los agentes de voz lo usan (ver VoiceAgent.ttsProvider), así que su
    // ausencia nunca debe bloquear la construcción del resto del bundle.
    getIntegrationCredential<ElevenLabsCredentialPayload>(organizationId, "elevenlabs"),
  ]);

  return buildAdapterBundle({
    simulationMode: false,
    twilio: twilioCreds ?? undefined,
    openai: openaiCreds ?? undefined,
    ghl: ghlCreds ?? undefined,
    elevenLabs: elevenLabsCreds ?? undefined,
  });
}
