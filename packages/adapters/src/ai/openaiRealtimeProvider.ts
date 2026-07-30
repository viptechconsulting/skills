import WebSocket from "ws";
import type {
  AIProvider,
  RealtimeSession,
  RealtimeSessionConfig,
  RealtimeSessionEvents,
} from "./AIProvider.js";

export interface OpenAIRealtimeConfig {
  apiKey: string;
  model: string;
  /** Milisegundos de espera sin respuesta del servidor antes de considerar la conexión muerta. */
  heartbeatTimeoutMs?: number;
}

const REALTIME_BASE_URL = "wss://api.openai.com/v1/realtime";

/** Mapea nuestros nombres de formato de audio al esquema de la API GA (session.audio.*.format). */
function toGaAudioFormat(format: "g711_ulaw" | "pcm16"): { type: string } {
  return { type: format === "g711_ulaw" ? "audio/pcmu" : "audio/pcm" };
}

class OpenAIRealtimeSession implements RealtimeSession {
  private ws: WebSocket | null = null;
  private events: RealtimeSessionEvents | null = null;
  private closed = false;
  private lastServerActivityAt = Date.now();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private hasActiveResponse = false;

  constructor(
    private readonly apiConfig: OpenAIRealtimeConfig,
    private readonly sessionConfig: RealtimeSessionConfig,
  ) {}

  async start(events: RealtimeSessionEvents): Promise<void> {
    this.events = events;

    await new Promise<void>((resolve, reject) => {
      // Sin el header "OpenAI-Beta: realtime=v1": esa era la forma de optar
      // por la API Realtime en Beta, que OpenAI retiró ("The Realtime Beta
      // API is no longer supported. Please use /v1/realtime for the GA
      // API."). La URL /v1/realtime ya es la de la API GA una vez que se
      // deja de pedir el modo beta.
      const url = `${REALTIME_BASE_URL}?model=${encodeURIComponent(this.apiConfig.model)}`;
      this.ws = new WebSocket(url, {
        headers: {
          Authorization: `Bearer ${this.apiConfig.apiKey}`,
        },
      });

      this.ws.on("open", () => {
        this.sendSessionUpdate();
        // Llamada saliente: el agente debe hablar primero (identificarse,
        // explicar el motivo de la llamada). Con turn_detection server_vad
        // el modelo solo responde después de detectar que el prospecto
        // dejó de hablar, así que sin este disparo inicial se queda
        // esperando en silencio indefinidamente.
        this.send({ type: "response.create" });
        this.startHeartbeatWatchdog();
        resolve();
      });

      this.ws.on("message", (raw) => {
        this.lastServerActivityAt = Date.now();
        this.handleServerEvent(raw.toString());
      });

      this.ws.on("error", (error) => {
        this.events?.onError(error instanceof Error ? error : new Error(String(error)));
        reject(error);
      });

      this.ws.on("close", () => {
        this.stopHeartbeatWatchdog();
        if (!this.closed) {
          this.events?.onClose();
        }
      });
    });
  }

  private sendSessionUpdate(): void {
    // Esquema de la API GA (distinto del Beta): requiere session.type,
    // "output_modalities" en vez de "modalities", y el audio anidado bajo
    // session.audio.input/session.audio.output en vez de campos planos
    // input_audio_format/output_audio_format/voice/turn_detection.
    this.send({
      type: "session.update",
      session: {
        type: "realtime",
        output_modalities: ["audio"],
        instructions: this.sessionConfig.systemPrompt,
        audio: {
          input: {
            format: toGaAudioFormat(this.sessionConfig.inputAudioFormat),
            turn_detection: {
              type: "server_vad",
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500,
            },
            transcription: { model: "whisper-1" },
          },
          output: {
            format: toGaAudioFormat(this.sessionConfig.outputAudioFormat),
            voice: this.sessionConfig.voice,
          },
        },
        tools: this.sessionConfig.tools.map((tool) => ({
          type: "function",
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        })),
        tool_choice: "auto",
      },
    });
  }

  private handleServerEvent(raw: string): void {
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(raw);
    } catch {
      return;
    }

    switch (event.type) {
      // La API GA renombró estos dos eventos (antes "response.audio.delta" /
      // "response.audio_transcript.delta" en Beta); se aceptan ambos nombres
      // por si acaso quedara alguna cuenta todavía en Beta.
      case "response.output_audio.delta":
      case "response.audio.delta": {
        const delta = event.delta as string | undefined;
        if (delta) this.events?.onAudioChunk(delta);
        break;
      }
      case "response.output_audio_transcript.delta":
      case "response.audio_transcript.delta": {
        const delta = event.delta as string | undefined;
        if (delta) this.events?.onTranscriptDelta("agent", delta);
        break;
      }
      case "response.created": {
        this.hasActiveResponse = true;
        break;
      }
      case "response.done": {
        this.hasActiveResponse = false;
        break;
      }
      case "conversation.item.input_audio_transcription.completed": {
        const transcript = event.transcript as string | undefined;
        if (transcript) this.events?.onTranscriptDelta("prospect", transcript);
        break;
      }
      case "input_audio_buffer.speech_started": {
        this.events?.onSpeechStartedByProspect();
        break;
      }
      case "response.function_call_arguments.done": {
        const callId = event.call_id as string | undefined;
        const name = event.name as string | undefined;
        const args = event.arguments as string | undefined;
        if (callId && name) {
          this.events?.onToolCall({ toolCallId: callId, name, argumentsJson: args ?? "{}" });
        }
        break;
      }
      case "error": {
        const message = (event.error as { message?: string } | undefined)?.message ?? "OpenAI Realtime error";
        // Benigno: puede ocurrir si el prospecto habla justo cuando el
        // modelo todavía no había empezado a responder (o ya había
        // terminado) y de todos modos mandamos response.cancel al detectar
        // el barge-in. No corresponde cerrar la llamada por esto.
        if (message.includes("Cancellation failed")) {
          this.hasActiveResponse = false;
          break;
        }
        this.events?.onError(new Error(message));
        break;
      }
      default:
        break;
    }
  }

  sendAudioChunk(base64Audio: string): void {
    this.send({ type: "input_audio_buffer.append", audio: base64Audio });
  }

  cancelCurrentResponse(): void {
    // OpenAI rechaza response.cancel con un error ("Cancellation failed: no
    // active response found") cuando no hay una respuesta en curso — pasa
    // seguido si el prospecto habla apenas atiende, antes de que el modelo
    // haya llegado a iniciar su respuesta.
    if (!this.hasActiveResponse) return;
    this.hasActiveResponse = false;
    this.send({ type: "response.cancel" });
  }

  submitToolResult(toolCallId: string, result: unknown): void {
    this.send({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: toolCallId,
        output: JSON.stringify(result ?? {}),
      },
    });
    this.send({ type: "response.create" });
  }

  async close(): Promise<void> {
    this.closed = true;
    this.stopHeartbeatWatchdog();
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
    this.ws = null;
  }

  private startHeartbeatWatchdog(): void {
    const timeoutMs = this.apiConfig.heartbeatTimeoutMs ?? 30_000;
    this.heartbeatTimer = setInterval(() => {
      if (Date.now() - this.lastServerActivityAt > timeoutMs) {
        this.events?.onError(new Error("OpenAI Realtime: sin actividad del servidor, cerrando sesión"));
        void this.close();
      }
    }, Math.min(timeoutMs, 10_000));
  }

  private stopHeartbeatWatchdog(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private send(payload: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }
}

export class OpenAIRealtimeProvider implements AIProvider {
  constructor(private readonly config: OpenAIRealtimeConfig) {}

  createRealtimeSession(sessionConfig: RealtimeSessionConfig): RealtimeSession {
    return new OpenAIRealtimeSession(this.config, sessionConfig);
  }
}
