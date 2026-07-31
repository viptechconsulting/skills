import {
  buildAdapterBundle,
  buildTelephonyProvider,
  type AdapterBundle,
  type ElevenLabsCredentialPayload,
  type GhlCredentialPayload,
  type OpenAICredentialPayload,
  type TelephonyProvider,
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

/**
 * Construye solo el adaptador de telefonía (para verificar firmas de
 * webhooks de Twilio y armar TwiML), sin desencriptar ni construir el resto
 * del bundle. Los webhooks de Twilio están en el camino crítico entre que la
 * persona atiende y el agente empieza a hablar — pedir el bundle completo
 * ahí (OpenAI, GHL, ElevenLabs) es trabajo desperdiciado que solo agrega
 * latencia percibida.
 */
export async function getTelephonyProviderForOrganization(
  organizationId: string,
  simulationMode: boolean,
): Promise<TelephonyProvider> {
  if (simulationMode) {
    return buildTelephonyProvider({ simulationMode: true });
  }
  const twilioCreds = await getIntegrationCredential<TwilioCredentialPayload>(organizationId, "twilio");
  return buildTelephonyProvider({ simulationMode: false, twilio: twilioCreds ?? undefined });
}
