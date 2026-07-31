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
  /**
   * Puede devolver una Promise; implementaciones que necesiten garantizar
   * que la ejecución de la herramienta (y su escritura en base de datos)
   * termine antes de avanzar (p. ej. el guion de simulación, antes de
   * disparar onClose) deben esperar esa promesa.
   */
  onToolCall: (request: RealtimeToolCallRequest) => void | Promise<void>;
  onTranscriptDelta: (speaker: "agent" | "prospect", text: string) => void;
  /**
   * Se dispara UNA vez por respuesta, tan pronto se detecta la primera
   * oración completa dentro del texto que va llegando de a poco (antes de
   * que la respuesta termine). Opcional: solo lo usan wrappers que
   * reemplazan el audio del proveedor de IA por otro motor de voz externo
   * (ver ElevenLabs), para poder empezar a sintetizar y hablar apenas hay
   * algo que decir, en vez de esperar la respuesta completa.
   */
  onAgentFirstSentenceReady?: (sentenceText: string) => void;
  /**
   * Se dispara una vez por respuesta del agente, al terminar. Si ya se
   * disparó onAgentFirstSentenceReady para esta respuesta, `text` es solo
   * el texto RESTANTE después de esa primera oración (para no sintetizarla
   * dos veces); si no, es el texto completo de la respuesta. Opcional, por
   * la misma razón que onAgentFirstSentenceReady.
   */
  onAgentUtteranceComplete?: (text: string) => void;
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
