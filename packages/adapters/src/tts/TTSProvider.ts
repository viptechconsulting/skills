export interface TTSStreamCallbacks {
  onChunk: (base64Audio: string) => void;
  onDone: () => void;
  onError: (error: Error) => void;
}

export interface TTSStreamHandle {
  /** Aborta el streaming en curso (usado en interrupciones/barge-in). */
  cancel(): void;
}

export interface TTSProvider {
  /**
   * Sintetiza el texto dado en audio ulaw 8kHz (formato que espera Twilio
   * Media Streams), entregando chunks base64 por `onChunk` a medida que
   * llegan. Devuelve un handle para cancelar el streaming en curso.
   */
  synthesizeStream(input: { text: string; voiceId: string }, callbacks: TTSStreamCallbacks): TTSStreamHandle;
}
