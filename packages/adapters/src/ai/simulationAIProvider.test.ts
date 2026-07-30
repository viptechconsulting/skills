import { describe, expect, it } from "vitest";
import { SimulationAIProvider } from "./simulationAIProvider.js";
import type { RealtimeSessionConfig } from "./AIProvider.js";

const BASE_CONFIG: RealtimeSessionConfig = {
  callId: "11111111-1111-1111-1111-111111111111",
  systemPrompt: "test",
  voice: "alloy",
  language: "es",
  tools: [],
  inputAudioFormat: "pcm16",
  outputAudioFormat: "pcm16",
};

describe("SimulationAIProvider — orden de eventos", () => {
  it("espera a que termine el handler asíncrono de onToolCall antes de disparar onClose", async () => {
    const provider = new SimulationAIProvider(() => [
      { afterMs: 0, kind: "tool_call", toolCall: { name: "end_call", args: {} } },
      { afterMs: 0, kind: "close" },
    ]);
    const session = provider.createRealtimeSession(BASE_CONFIG);

    let toolCallFinishedAt = 0;
    let closedAt = 0;

    await new Promise<void>((resolve) => {
      session.start({
        onAudioChunk: () => undefined,
        onTranscriptDelta: () => undefined,
        onSpeechStartedByProspect: () => undefined,
        onToolCall: async () => {
          // Simula una escritura en base de datos lenta (el escenario real
          // que causaba la condición de carrera: end_call actualizando
          // Call.outcome).
          await new Promise((r) => setTimeout(r, 50));
          toolCallFinishedAt = Date.now();
        },
        onError: () => undefined,
        onClose: () => {
          closedAt = Date.now();
          resolve();
        },
      });
    });

    expect(toolCallFinishedAt).toBeGreaterThan(0);
    expect(closedAt).toBeGreaterThanOrEqual(toolCallFinishedAt);
  });
});
