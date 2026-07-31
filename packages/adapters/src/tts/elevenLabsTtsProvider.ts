import type { TTSProvider, TTSStreamCallbacks, TTSStreamHandle } from "./TTSProvider.js";

const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";

export interface ElevenLabsConfig {
  apiKey: string;
}

export class ElevenLabsTtsProvider implements TTSProvider {
  constructor(private readonly config: ElevenLabsConfig) {}

  synthesizeStream(input: { text: string; voiceId: string }, callbacks: TTSStreamCallbacks): TTSStreamHandle {
    const controller = new AbortController();

    void this.run(input, callbacks, controller).catch((error) => {
      // Un abort intencional (cancel()) rechaza la lectura del stream; no es
      // un error real, así que no se reporta como tal.
      if (!controller.signal.aborted) callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    });

    return {
      cancel: () => controller.abort(),
    };
  }

  private async run(
    input: { text: string; voiceId: string },
    callbacks: TTSStreamCallbacks,
    controller: AbortController,
  ): Promise<void> {
    const response = await fetch(
      `${ELEVENLABS_BASE_URL}/text-to-speech/${encodeURIComponent(input.voiceId)}/stream?output_format=ulaw_8000`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          "xi-api-key": this.config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: input.text,
          model_id: "eleven_multilingual_v2",
        }),
      },
    );

    if (!response.ok || !response.body) {
      const body = await response.text().catch(() => "");
      throw new Error(`ElevenLabs API error ${response.status}: ${body}`);
    }

    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done || controller.signal.aborted) break;
      if (value) callbacks.onChunk(Buffer.from(value).toString("base64"));
    }
    if (!controller.signal.aborted) callbacks.onDone();
  }
}
