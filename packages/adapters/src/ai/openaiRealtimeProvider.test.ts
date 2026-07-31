import { describe, expect, it } from "vitest";
import { detectFirstSentenceBoundary } from "./openaiRealtimeProvider.js";

describe("detectFirstSentenceBoundary", () => {
  it("detecta la primera oración completa y calcula cuánto texto ocupa (incluyendo el espacio separador)", () => {
    const text = "¡Hola Juan! ¿Cómo estás hoy?";
    const boundary = detectFirstSentenceBoundary(text);

    expect(boundary).not.toBeNull();
    expect(boundary?.sentence).toBe("¡Hola Juan!");
    // El resto (sin arrastrar el espacio separador) debe quedar limpio.
    expect(text.slice(boundary!.sliceLength)).toBe("¿Cómo estás hoy?");
  });

  it("no detecta nada si todavía no hay ningún cierre de oración", () => {
    expect(detectFirstSentenceBoundary("¡Hola")).toBeNull();
    expect(detectFirstSentenceBoundary("")).toBeNull();
  });

  it("no dispara en signos de puntuación sueltos muy al principio (evita cortes falsos)", () => {
    // Menos de 8 caracteres antes del signo: no cuenta como oración real todavía.
    expect(detectFirstSentenceBoundary("Sí. Y")).toBeNull();
  });

  it("funciona con una respuesta de una sola oración (sin resto después)", () => {
    const text = "Hola, ¿en qué puedo ayudarte?";
    const boundary = detectFirstSentenceBoundary(text);

    expect(boundary?.sentence).toBe(text);
    expect(text.slice(boundary!.sliceLength)).toBe("");
  });

  it("se actualiza correctamente a medida que el texto se va acumulando de a poco (deltas)", () => {
    const chunks = ["¡Hola ", "Juan! ", "¿Cómo estás ", "hoy?"];
    let accumulated = "";
    let firstBoundary: ReturnType<typeof detectFirstSentenceBoundary> = null;

    for (const chunk of chunks) {
      accumulated += chunk;
      if (!firstBoundary) firstBoundary = detectFirstSentenceBoundary(accumulated);
    }

    expect(firstBoundary?.sentence).toBe("¡Hola Juan!");
    expect(accumulated.slice(firstBoundary!.sliceLength)).toBe("¿Cómo estás hoy?");
  });
});
