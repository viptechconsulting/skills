import type { TelephonyProvider } from "./telephony/TelephonyProvider.js";
import { TwilioTelephonyProvider } from "./telephony/twilioTelephonyProvider.js";
import { SimulationTelephonyProvider } from "./telephony/simulationTelephonyProvider.js";
import type { AIProvider } from "./ai/AIProvider.js";
import { OpenAIRealtimeProvider } from "./ai/openaiRealtimeProvider.js";
import { SimulationAIProvider } from "./ai/simulationAIProvider.js";
import type { CrmProvider } from "./crm/CrmProvider.js";
import { GhlCrmProvider } from "./crm/ghlCrmProvider.js";
import { SimulationCrmProvider } from "./crm/simulationCrmProvider.js";
import type { CalendarProvider } from "./calendar/CalendarProvider.js";
import { GhlCalendarProvider } from "./calendar/ghlCalendarProvider.js";
import { SimulationCalendarProvider } from "./calendar/simulationCalendarProvider.js";
import type { MessagingProvider } from "./messaging/MessagingProvider.js";
import { TwilioMessagingProvider } from "./messaging/twilioMessagingProvider.js";
import { SimulationMessagingProvider } from "./messaging/simulationMessagingProvider.js";
import type { TTSProvider } from "./tts/TTSProvider.js";
import { ElevenLabsTtsProvider } from "./tts/elevenLabsTtsProvider.js";

export interface TwilioCredentialPayload {
  accountSid: string;
  authToken: string;
}

export interface OpenAICredentialPayload {
  apiKey: string;
  model: string;
}

export interface GhlCredentialPayload {
  baseUrl: string;
  accessToken: string;
  locationId: string;
}

export interface ElevenLabsCredentialPayload {
  apiKey: string;
}

export interface AdapterBundle {
  telephony: TelephonyProvider;
  ai: AIProvider;
  crm: CrmProvider;
  calendar: CalendarProvider;
  messaging: MessagingProvider;
  /**
   * Solo definido si la organización conectó ElevenLabs. A diferencia del
   * resto, es opcional incluso fuera de modo simulación: no todos los
   * agentes de voz lo necesitan (ver VoiceAgent.ttsProvider).
   */
  tts?: TTSProvider;
}

export interface BuildAdapterBundleInput {
  simulationMode: boolean;
  twilio?: TwilioCredentialPayload;
  openai?: OpenAICredentialPayload;
  ghl?: GhlCredentialPayload;
  elevenLabs?: ElevenLabsCredentialPayload;
}

/**
 * Construye el conjunto de adaptadores para una organización. En modo
 * simulación, ignora cualquier credencial real y usa exclusivamente las
 * implementaciones en memoria — así una organización nunca puede, por
 * accidente de configuración, marcar un teléfono real estando en modo
 * simulación.
 */
export function buildAdapterBundle(input: BuildAdapterBundleInput): AdapterBundle {
  if (input.simulationMode) {
    return {
      telephony: new SimulationTelephonyProvider(),
      ai: new SimulationAIProvider(),
      crm: new SimulationCrmProvider(),
      calendar: new SimulationCalendarProvider(),
      messaging: new SimulationMessagingProvider(),
    };
  }

  if (!input.twilio) {
    throw new Error("Faltan credenciales de Twilio para operar fuera de modo simulación");
  }
  if (!input.openai) {
    throw new Error("Faltan credenciales de OpenAI para operar fuera de modo simulación");
  }
  if (!input.ghl) {
    throw new Error("Faltan credenciales de GoHighLevel para operar fuera de modo simulación");
  }

  return {
    telephony: new TwilioTelephonyProvider(input.twilio),
    ai: new OpenAIRealtimeProvider({ apiKey: input.openai.apiKey, model: input.openai.model }),
    crm: new GhlCrmProvider(input.ghl),
    calendar: new GhlCalendarProvider(input.ghl),
    messaging: new TwilioMessagingProvider(input.twilio),
    tts: input.elevenLabs ? new ElevenLabsTtsProvider(input.elevenLabs) : undefined,
  };
}
