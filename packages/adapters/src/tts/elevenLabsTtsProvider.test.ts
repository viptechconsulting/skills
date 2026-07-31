import { afterEach, describe, expect, it, vi } from "vitest";
import { ElevenLabsTtsProvider } from "./elevenLabsTtsProvider.js";

function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(chunks[i]!);
        i += 1;
      } else {
        controller.close();
      }
    },
  });
}

describe("ElevenLabsTtsProvider.synthesizeStream", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("entrega los chunks de audio en base64 y llama onDone al terminar", async () => {
    const chunkA = new Uint8Array([1, 2, 3]);
    const chunkB = new Uint8Array([4, 5, 6]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: streamOf([chunkA, chunkB]),
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new ElevenLabsTtsProvider({ apiKey: "test-key" });
    const chunks: string[] = [];
    let done = false;

    await new Promise<void>((resolve, reject) => {
      provider.synthesizeStream(
        { text: "Hola, ¿cómo estás?", voiceId: "voice-123" },
        {
          onChunk: (base64) => chunks.push(base64),
          onDone: () => {
            done = true;
            resolve();
          },
          onError: (error) => reject(error),
        },
      );
    });

    expect(done).toBe(true);
    expect(chunks).toEqual([Buffer.from(chunkA).toString("base64"), Buffer.from(chunkB).toString("base64")]);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/text-to-speech/voice-123/stream");
    expect(url).toContain("output_format=ulaw_8000");
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("test-key");
    expect(JSON.parse(init.body as string)).toMatchObject({ text: "Hola, ¿cómo estás?" });
  });

  it("reporta un error si la API responde con un status no exitoso", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, body: null, text: () => Promise.resolve("unauthorized") }),
    );

    const provider = new ElevenLabsTtsProvider({ apiKey: "bad-key" });

    await new Promise<void>((resolve) => {
      provider.synthesizeStream(
        { text: "hola", voiceId: "voice-123" },
        {
          onChunk: () => undefined,
          onDone: () => undefined,
          onError: (error) => {
            expect(error.message).toContain("401");
            resolve();
          },
        },
      );
    });
  });

  it("cancel() no reporta error aunque el fetch subyacente rechace por el abort", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            const error = new Error("The operation was aborted");
            error.name = "AbortError";
            reject(error);
          });
        });
      }),
    );

    const provider = new ElevenLabsTtsProvider({ apiKey: "test-key" });
    const onError = vi.fn();
    const handle = provider.synthesizeStream(
      { text: "hola", voiceId: "voice-123" },
      { onChunk: () => undefined, onDone: () => undefined, onError },
    );
    handle.cancel();

    await new Promise((r) => setTimeout(r, 10));
    expect(onError).not.toHaveBeenCalled();
  });
});
