export interface OriginateCallInput {
  toE164: string;
  fromE164: string;
  /** URL que Twilio consultará para obtener el TwiML inicial (conecta el Media Stream). */
  answerWebhookUrl: string;
  /** URL de status callback para eventos de progreso de la llamada. */
  statusCallbackUrl: string;
  /** URL de callback de Answering Machine Detection. */
  machineDetectionCallbackUrl?: string;
  recordingEnabled: boolean;
  recordingStatusCallbackUrl?: string;
}

export interface OriginateCallResult {
  providerCallSid: string;
}

export interface TransferCallInput {
  providerCallSid: string;
  transferToE164: string;
}

/**
 * Abstracción de telefonía. Cualquier proveedor (Twilio, otro) implementa
 * esta interfaz; la lógica de negocio nunca importa el SDK del proveedor
 * directamente.
 */
export interface TelephonyProvider {
  originateCall(input: OriginateCallInput): Promise<OriginateCallResult>;
  /** Cuelga una llamada en curso (usado por cancelaciones y end_call). */
  hangupCall(providerCallSid: string): Promise<void>;
  /** Intenta una transferencia cálida (conferencia) a un humano. */
  transferCall(input: TransferCallInput): Promise<{ ok: boolean; error?: string }>;
  /**
   * Verifica la firma criptográfica de un webhook entrante. Debe usarse en
   * TODOS los webhooks antes de procesar su contenido.
   */
  verifyWebhookSignature(input: { url: string; signatureHeader: string | undefined; params: Record<string, string> }): boolean;
  /** Genera el TwiML que conecta la llamada al Media Stream bidireccional. */
  buildMediaStreamTwiml(input: { mediaStreamWebSocketUrl: string; callId: string }): string;
}
