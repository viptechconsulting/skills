import type { RealtimeSession, RealtimeSessionEvents } from "./AIProvider.js";
import type { TTSProvider, TTSStreamHandle } from "../tts/TTSProvider.js";

/**
 * Envuelve una sesión Realtime existente (que sigue escuchando, razonando y
 * decidiendo qué herramientas ejecutar con total normalidad) para reemplazar
 * el audio de salida del proveedor de IA por voz sintetizada con otro motor
 * de TTS (ElevenLabs), que suena con acento nativo real en español — algo
 * que las voces de OpenAI Realtime no logran solo con instrucciones de
 * texto. Se sintetiza a partir del transcript ya acumulado por la sesión
 * interna (mismo texto que se guarda en el historial de la llamada), en vez
 * de pedirle a OpenAI un modo de salida de solo texto no probado en este
 * proyecto.
 */
export function wrapRealtimeSessionWithElevenLabsVoice(
  inner: RealtimeSession,
  tts: TTSProvider,
  voiceId: string,
): RealtimeSession {
  let activeStream: TTSStreamHandle | null = null;
  // Texto que ya está listo pero espera a que termine de sonar el audio en
  // curso: nunca se sintetizan dos fragmentos en simultáneo (mezclaría dos
  // streams de audio a la vez), pero sí se empieza a hablar la primera
  // oración apenas está lista, sin esperar el resto de la respuesta.
  let pendingText: string | null = null;

  function speak(text: string, events: RealtimeSessionEvents): void {
    if (!text.trim()) return;
    activeStream = tts.synthesizeStream(
      { text, voiceId },
      {
        onChunk: events.onAudioChunk,
        onDone: () => {
          activeStream = null;
          if (pendingText !== null) {
            const next = pendingText;
            pendingText = null;
            speak(next, events);
          }
        },
        onError: events.onError,
      },
    );
  }

  function cancelActiveStream(): void {
    activeStream?.cancel();
    activeStream = null;
    pendingText = null;
  }

  return {
    async start(events: RealtimeSessionEvents): Promise<void> {
      await inner.start({
        // El audio que genera el proveedor de IA se descarta: la voz real
        // que llega a Twilio la sintetiza `tts` a partir del transcript.
        onAudioChunk: () => undefined,
        onToolCall: events.onToolCall,
        onTranscriptDelta: events.onTranscriptDelta,
        onSpeechStartedByProspect: () => {
          cancelActiveStream();
          events.onSpeechStartedByProspect();
        },
        onError: events.onError,
        onClose: events.onClose,
        onAgentFirstSentenceReady: (sentenceText) => {
          speak(sentenceText, events);
        },
        onAgentUtteranceComplete: (text) => {
          if (!text.trim()) return;
          if (activeStream) {
            // La primera oración todavía está sonando: se encola el resto
            // para que arranque justo al terminar, en el mismo orden.
            pendingText = text;
          } else {
            speak(text, events);
          }
        },
      });
    },
    sendAudioChunk: (base64Audio) => inner.sendAudioChunk(base64Audio),
    cancelCurrentResponse: () => {
      inner.cancelCurrentResponse();
      cancelActiveStream();
    },
    submitToolResult: (toolCallId, result) => inner.submitToolResult(toolCallId, result),
    close: async () => {
      cancelActiveStream();
      await inner.close();
    },
  };
}
