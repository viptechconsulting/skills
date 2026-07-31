import { describe, expect, it, vi } from "vitest";
import { wrapRealtimeSessionWithElevenLabsVoice } from "./elevenLabsVoiceSession.js";
import type { RealtimeSession, RealtimeSessionEvents } from "./AIProvider.js";
import type { TTSProvider, TTSStreamCallbacks, TTSStreamHandle } from "../tts/TTSProvider.js";

/** Sesión interna falsa que expone sus `events` para disparar callbacks a mano. */
function createFakeInnerSession(): RealtimeSession & { events: RealtimeSessionEvents } {
  let capturedEvents: RealtimeSessionEvents;
  const session: RealtimeSession & { events: RealtimeSessionEvents } = {
    start: vi.fn(async (events: RealtimeSessionEvents) => {
      capturedEvents = events;
    }),
    sendAudioChunk: vi.fn(),
    cancelCurrentResponse: vi.fn(),
    submitToolResult: vi.fn(),
    close: vi.fn(async () => undefined),
    get events() {
      return capturedEvents;
    },
  } as never;
  return session;
}

function createFakeTts(): TTSProvider & { lastCallbacks: TTSStreamCallbacks | null; cancel: ReturnType<typeof vi.fn> } {
  const cancel = vi.fn();
  const fake = {
    lastCallbacks: null as TTSStreamCallbacks | null,
    cancel,
    synthesizeStream: vi.fn((_input, callbacks: TTSStreamCallbacks): TTSStreamHandle => {
      fake.lastCallbacks = callbacks;
      return { cancel };
    }),
  };
  return fake;
}

describe("wrapRealtimeSessionWithElevenLabsVoice", () => {
  it("descarta el audio del proveedor interno y sintetiza con ElevenLabs al completarse una respuesta", async () => {
    const inner = createFakeInnerSession();
    const tts = createFakeTts();
    const wrapped = wrapRealtimeSessionWithElevenLabsVoice(inner, tts, "voice-abc");

    const outerAudioChunks: string[] = [];
    await wrapped.start({
      onAudioChunk: (chunk) => outerAudioChunks.push(chunk),
      onToolCall: () => undefined,
      onTranscriptDelta: () => undefined,
      onSpeechStartedByProspect: () => undefined,
      onError: () => undefined,
      onClose: () => undefined,
    });

    // El audio nativo de OpenAI se descarta silenciosamente.
    inner.events.onAudioChunk("openai-audio-chunk");
    expect(outerAudioChunks).toEqual([]);

    // Al completarse la respuesta, se sintetiza con ElevenLabs...
    inner.events.onAgentUtteranceComplete?.("Hola, soy tu asistente.");
    expect(tts.synthesizeStream).toHaveBeenCalledWith(
      { text: "Hola, soy tu asistente.", voiceId: "voice-abc" },
      expect.anything(),
    );

    // ...y sus chunks sí llegan al onAudioChunk externo.
    tts.lastCallbacks?.onChunk("elevenlabs-chunk-1");
    expect(outerAudioChunks).toEqual(["elevenlabs-chunk-1"]);
  });

  it("no sintetiza nada si el texto acumulado está vacío", async () => {
    const inner = createFakeInnerSession();
    const tts = createFakeTts();
    const wrapped = wrapRealtimeSessionWithElevenLabsVoice(inner, tts, "voice-abc");
    await wrapped.start({
      onAudioChunk: () => undefined,
      onToolCall: () => undefined,
      onTranscriptDelta: () => undefined,
      onSpeechStartedByProspect: () => undefined,
      onError: () => undefined,
      onClose: () => undefined,
    });

    inner.events.onAgentUtteranceComplete?.("   ");
    expect(tts.synthesizeStream).not.toHaveBeenCalled();
  });

  it("cancela el streaming de TTS activo en un barge-in y lo propaga hacia afuera", async () => {
    const inner = createFakeInnerSession();
    const tts = createFakeTts();
    const wrapped = wrapRealtimeSessionWithElevenLabsVoice(inner, tts, "voice-abc");

    let outerSpeechStarted = false;
    await wrapped.start({
      onAudioChunk: () => undefined,
      onToolCall: () => undefined,
      onTranscriptDelta: () => undefined,
      onSpeechStartedByProspect: () => {
        outerSpeechStarted = true;
      },
      onError: () => undefined,
      onClose: () => undefined,
    });

    inner.events.onAgentUtteranceComplete?.("Estaba hablando...");
    inner.events.onSpeechStartedByProspect();

    expect(tts.cancel).toHaveBeenCalledTimes(1);
    expect(outerSpeechStarted).toBe(true);
  });

  it("cancelCurrentResponse cancela tanto la sesión interna como el streaming de TTS", async () => {
    const inner = createFakeInnerSession();
    const tts = createFakeTts();
    const wrapped = wrapRealtimeSessionWithElevenLabsVoice(inner, tts, "voice-abc");
    await wrapped.start({
      onAudioChunk: () => undefined,
      onToolCall: () => undefined,
      onTranscriptDelta: () => undefined,
      onSpeechStartedByProspect: () => undefined,
      onError: () => undefined,
      onClose: () => undefined,
    });

    inner.events.onAgentUtteranceComplete?.("Respuesta en curso");
    wrapped.cancelCurrentResponse();

    expect(inner.cancelCurrentResponse).toHaveBeenCalledTimes(1);
    expect(tts.cancel).toHaveBeenCalledTimes(1);
  });

  it("reenvía sendAudioChunk, submitToolResult y close a la sesión interna", async () => {
    const inner = createFakeInnerSession();
    const tts = createFakeTts();
    const wrapped = wrapRealtimeSessionWithElevenLabsVoice(inner, tts, "voice-abc");
    await wrapped.start({
      onAudioChunk: () => undefined,
      onToolCall: () => undefined,
      onTranscriptDelta: () => undefined,
      onSpeechStartedByProspect: () => undefined,
      onError: () => undefined,
      onClose: () => undefined,
    });

    wrapped.sendAudioChunk("prospect-audio");
    wrapped.submitToolResult("call-1", { ok: true });
    await wrapped.close();

    expect(inner.sendAudioChunk).toHaveBeenCalledWith("prospect-audio");
    expect(inner.submitToolResult).toHaveBeenCalledWith("call-1", { ok: true });
    expect(inner.close).toHaveBeenCalledTimes(1);
  });

  it("empieza a sintetizar la primera oración apenas está lista, sin esperar el resto de la respuesta", async () => {
    const inner = createFakeInnerSession();
    const tts = createFakeTts();
    const wrapped = wrapRealtimeSessionWithElevenLabsVoice(inner, tts, "voice-abc");
    await wrapped.start({
      onAudioChunk: () => undefined,
      onToolCall: () => undefined,
      onTranscriptDelta: () => undefined,
      onSpeechStartedByProspect: () => undefined,
      onError: () => undefined,
      onClose: () => undefined,
    });

    inner.events.onAgentFirstSentenceReady?.("¡Hola Juan!");
    expect(tts.synthesizeStream).toHaveBeenCalledTimes(1);
    expect(tts.synthesizeStream).toHaveBeenCalledWith({ text: "¡Hola Juan!", voiceId: "voice-abc" }, expect.anything());
  });

  it("encola el resto de la respuesta hasta que termina de sonar la primera oración, sin mezclar audio", async () => {
    const inner = createFakeInnerSession();
    const tts = createFakeTts();
    const wrapped = wrapRealtimeSessionWithElevenLabsVoice(inner, tts, "voice-abc");
    const audioChunks: string[] = [];
    await wrapped.start({
      onAudioChunk: (chunk) => audioChunks.push(chunk),
      onToolCall: () => undefined,
      onTranscriptDelta: () => undefined,
      onSpeechStartedByProspect: () => undefined,
      onError: () => undefined,
      onClose: () => undefined,
    });

    inner.events.onAgentFirstSentenceReady?.("¡Hola Juan!");
    const firstCallbacks = (tts.synthesizeStream as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as TTSStreamCallbacks;

    // La respuesta termina de generarse (el resto del texto) mientras la
    // primera oración todavía está sonando: no debe arrancar un segundo
    // stream todavía.
    inner.events.onAgentUtteranceComplete?.(" ¿Cómo estás hoy?");
    expect(tts.synthesizeStream).toHaveBeenCalledTimes(1);

    firstCallbacks.onChunk("audio-primera-oracion");
    firstCallbacks.onDone();

    // Recién ahí arranca el segundo fragmento.
    expect(tts.synthesizeStream).toHaveBeenCalledTimes(2);
    expect(tts.synthesizeStream).toHaveBeenNthCalledWith(
      2,
      { text: " ¿Cómo estás hoy?", voiceId: "voice-abc" },
      expect.anything(),
    );
    expect(audioChunks).toEqual(["audio-primera-oracion"]);
  });

  it("un barge-in durante la primera oración también descarta el resto ya encolado", async () => {
    const inner = createFakeInnerSession();
    const tts = createFakeTts();
    const wrapped = wrapRealtimeSessionWithElevenLabsVoice(inner, tts, "voice-abc");
    await wrapped.start({
      onAudioChunk: () => undefined,
      onToolCall: () => undefined,
      onTranscriptDelta: () => undefined,
      onSpeechStartedByProspect: () => undefined,
      onError: () => undefined,
      onClose: () => undefined,
    });

    inner.events.onAgentFirstSentenceReady?.("¡Hola Juan!");
    inner.events.onAgentUtteranceComplete?.(" ¿Cómo estás hoy?");
    const firstCallbacks = (tts.synthesizeStream as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as TTSStreamCallbacks;

    inner.events.onSpeechStartedByProspect();
    // Aunque el primer stream "termine" después de la interrupción, el resto
    // encolado ya se descartó y no debe arrancar un segundo stream.
    firstCallbacks.onDone();
    expect(tts.synthesizeStream).toHaveBeenCalledTimes(1);
  });
});
