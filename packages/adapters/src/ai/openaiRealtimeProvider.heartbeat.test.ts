import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Reemplaza el módulo `ws` por un doble controlable a mano: sin esto no hay
 * forma de probar la lógica de ping/pong sin abrir una conexión real a
 * OpenAI. Expone `ping`/`close` como espías y permite simular la llegada
 * (o ausencia) de un "pong" del servidor.
 */
class FakeWebSocket extends EventEmitter {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState = FakeWebSocket.OPEN;
  ping = vi.fn();
  close = vi.fn(() => {
    this.readyState = FakeWebSocket.CLOSED;
  });
  send = vi.fn();

  constructor(
    public readonly url: string,
    public readonly options: unknown,
  ) {
    super();
  }
}

let lastSocket: FakeWebSocket | null = null;

vi.mock("ws", () => {
  class WebSocketMock extends FakeWebSocket {
    constructor(url: string, options: unknown) {
      super(url, options);
      lastSocket = this;
    }
  }
  return { default: WebSocketMock };
});

describe("OpenAIRealtimeSession — watchdog de conexión (ping/pong)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    lastSocket = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function startSession(heartbeatTimeoutMs: number) {
    const { OpenAIRealtimeProvider } = await import("./openaiRealtimeProvider.js");
    const provider = new OpenAIRealtimeProvider({ apiKey: "test-key", model: "test-model", heartbeatTimeoutMs });
    const session = provider.createRealtimeSession({
      callId: "11111111-1111-1111-1111-111111111111",
      systemPrompt: "test",
      voice: "alloy",
      language: "es",
      tools: [],
      inputAudioFormat: "g711_ulaw",
      outputAudioFormat: "g711_ulaw",
    });

    const onError = vi.fn();
    const startPromise = session.start({
      onAudioChunk: () => undefined,
      onToolCall: () => undefined,
      onTranscriptDelta: () => undefined,
      onSpeechStartedByProspect: () => undefined,
      onError,
      onClose: () => undefined,
    });

    // El código resuelve `start()` en el handler "open" del socket.
    lastSocket!.emit("open");
    await startPromise;

    return { socket: lastSocket!, onError };
  }

  it("no mata la sesión por una pausa larga del prospecto si el pong llega a tiempo", async () => {
    const { socket, onError } = await startSession(30_000);

    // Primer ciclo: se manda un ping (nada de "actividad conversacional" en 30s).
    await vi.advanceTimersByTimeAsync(30_000);
    expect(socket.ping).toHaveBeenCalledTimes(1);

    // El servidor responde el pong (la conexión está viva, aunque nadie hable).
    socket.emit("pong");

    // Un segundo silencio conversacional largo tampoco debería matar la sesión.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(onError).not.toHaveBeenCalled();
    expect(socket.close).not.toHaveBeenCalled();
  });

  it("cierra la sesión si dos ciclos seguidos no reciben pong (conexión realmente muerta)", async () => {
    const { socket, onError } = await startSession(30_000);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(socket.ping).toHaveBeenCalledTimes(1);
    // Sin pong esta vez.

    await vi.advanceTimersByTimeAsync(30_000);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]?.message).toContain("ping");
    expect(socket.close).toHaveBeenCalledTimes(1);
  });
});
