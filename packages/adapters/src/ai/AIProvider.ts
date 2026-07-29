export interface RealtimeToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface RealtimeSessionConfig {
  callId: string;
  systemPrompt: string;
  voice: string;
  language: string;
  tools: RealtimeToolDefinition[];
  /** Formato de audio esperado por el otro extremo (Twilio usa g711_ulaw a 8kHz). */
  inputAudioFormat: "g711_ulaw" | "pcm16";
  outputAudioFormat: "g711_ulaw" | "pcm16";
}

export interface RealtimeToolCallRequest {
  toolCallId: string;
  name: string;
  argumentsJson: string;
}

export interface RealtimeSessionEvents {
  onAudioChunk: (base64Audio: string) => void;
  onToolCall: (request: RealtimeToolCallRequest) => void;
  onTranscriptDelta: (speaker: "agent" | "prospect", text: string) => void;
  onSpeechStartedByProspect: () => void;
  onError: (error: Error) => void;
  onClose: () => void;
}

/**
 * Representa una sesión de conversación de voz en tiempo real con el
 * proveedor de IA (OpenAI Realtime u otro). El bridge de audio de apps/api
 * es responsable de conectar esta sesión con el Media Stream de Twilio.
 */
export interface RealtimeSession {
  start(events: RealtimeSessionEvents): Promise<void>;
  /** Envía un chunk de audio entrante (base64, en el formato de inputAudioFormat). */
  sendAudioChunk(base64Audio: string): void;
  /**
   * Notifica que el prospecto empezó a hablar mientras el agente respondía
   * (interrupción/barge-in): cancela la respuesta en curso del modelo.
   */
  cancelCurrentResponse(): void;
  /** Envía el resultado de una tool call ejecutada por el backend. */
  submitToolResult(toolCallId: string, result: unknown): void;
  /** Cierra la sesión y libera recursos (WebSocket, timers, buffers). */
  close(): Promise<void>;
}

export interface AIProvider {
  createRealtimeSession(config: RealtimeSessionConfig): RealtimeSession;
}
