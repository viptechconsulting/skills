import { randomUUID } from "node:crypto";
import type {
  AIProvider,
  RealtimeSession,
  RealtimeSessionConfig,
  RealtimeSessionEvents,
  RealtimeToolCallRequest,
} from "./AIProvider.js";

export interface SimulationScriptStep {
  afterMs: number;
  kind: "transcript" | "tool_call" | "close";
  speaker?: "agent" | "prospect";
  text?: string;
  toolCall?: { name: string; args: Record<string, unknown> };
}

export type SimulationScriptFactory = (config: RealtimeSessionConfig) => SimulationScriptStep[];

/**
 * Guion por defecto: el agente saluda, "escucha" una respuesta simulada del
 * prospecto, y termina la llamada con un resultado calificado pero sin
 * cita. Pensado para probar el flujo completo (estado de llamada,
 * ejecución de herramientas, resultado estructurado) sin auditar ni gastar
 * créditos de IA real.
 */
const defaultScriptFactory: SimulationScriptFactory = (config) => [
  { afterMs: 50, kind: "transcript", speaker: "agent", text: "Hola, te llamo de parte del equipo. ¿Hablo con la persona correcta?" },
  { afterMs: 100, kind: "transcript", speaker: "prospect", text: "Sí, dime." },
  {
    afterMs: 150,
    kind: "tool_call",
    toolCall: {
      name: "add_call_note",
      args: { callId: config.callId, note: "Prospecto disponible, conversación simulada en curso." },
    },
  },
  {
    afterMs: 200,
    kind: "tool_call",
    toolCall: {
      name: "end_call",
      args: {
        callId: config.callId,
        outcome: "QUALIFIED_NOT_BOOKED",
        summary: "Llamada simulada: el prospecto mostró interés pero no se agendó cita en este guion de prueba.",
      },
    },
  },
  { afterMs: 210, kind: "close" },
];

class SimulationRealtimeSession implements RealtimeSession {
  private timers: ReturnType<typeof setTimeout>[] = [];
  private events: RealtimeSessionEvents | null = null;
  private closed = false;

  constructor(
    private readonly config: RealtimeSessionConfig,
    private readonly scriptFactory: SimulationScriptFactory,
  ) {}

  async start(events: RealtimeSessionEvents): Promise<void> {
    this.events = events;
    const script = this.scriptFactory(this.config);

    for (const step of script) {
      const timer = setTimeout(() => this.runStep(step), step.afterMs);
      this.timers.push(timer);
    }
  }

  private runStep(step: SimulationScriptStep): void {
    if (this.closed || !this.events) return;

    if (step.kind === "transcript" && step.speaker && step.text) {
      this.events.onTranscriptDelta(step.speaker, step.text);
    } else if (step.kind === "tool_call" && step.toolCall) {
      const request: RealtimeToolCallRequest = {
        toolCallId: randomUUID(),
        name: step.toolCall.name,
        argumentsJson: JSON.stringify(step.toolCall.args),
      };
      this.events.onToolCall(request);
    } else if (step.kind === "close") {
      this.events.onClose();
    }
  }

  sendAudioChunk(_base64Audio: string): void {
    // En simulación no se procesa audio real.
  }

  cancelCurrentResponse(): void {
    // No hay respuesta en curso que cancelar en simulación.
  }

  submitToolResult(_toolCallId: string, _result: unknown): void {
    // El guion de simulación no depende de resultados de herramientas.
  }

  async close(): Promise<void> {
    this.closed = true;
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }
}

export class SimulationAIProvider implements AIProvider {
  constructor(private readonly scriptFactory: SimulationScriptFactory = defaultScriptFactory) {}

  createRealtimeSession(config: RealtimeSessionConfig): RealtimeSession {
    return new SimulationRealtimeSession(config, this.scriptFactory);
  }
}
