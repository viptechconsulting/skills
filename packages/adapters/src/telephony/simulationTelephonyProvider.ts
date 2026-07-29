import { randomUUID } from "node:crypto";
import type {
  OriginateCallInput,
  OriginateCallResult,
  TelephonyProvider,
  TransferCallInput,
} from "./TelephonyProvider.js";

/**
 * Proveedor de telefonía para modo simulación: no marca ningún teléfono
 * real. Genera un CallSid simulado y deja que el orquestador (worker/api)
 * avance la máquina de estados sintéticamente para poder probar todo el
 * flujo de negocio (elegibilidad, reintentos, resultados estructurados,
 * herramientas del agente) sin gastar créditos ni tocar servicios externos.
 */
export class SimulationTelephonyProvider implements TelephonyProvider {
  async originateCall(_input: OriginateCallInput): Promise<OriginateCallResult> {
    return { providerCallSid: `SIMCALL_${randomUUID()}` };
  }

  async hangupCall(_providerCallSid: string): Promise<void> {
    // no-op: no hay llamada real que colgar.
  }

  async transferCall(_input: TransferCallInput): Promise<{ ok: boolean; error?: string }> {
    return { ok: true };
  }

  verifyWebhookSignature(_input: {
    url: string;
    signatureHeader: string | undefined;
    params: Record<string, string>;
  }): boolean {
    // En simulación no llegan webhooks reales de Twilio; se aceptan
    // eventos generados internamente por el propio sistema.
    return true;
  }

  buildMediaStreamTwiml(input: { mediaStreamWebSocketUrl: string; callId: string }): string {
    return `<Response><!-- simulation mode, no real TwiML dialed --><Connect><Stream url="${input.mediaStreamWebSocketUrl}"><Parameter name="callId" value="${input.callId}"/></Stream></Connect></Response>`;
  }
}
