import { describe, expect, it } from "vitest";
import { buildAdapterBundle } from "./factory.js";
import { SimulationTelephonyProvider } from "./telephony/simulationTelephonyProvider.js";

describe("buildAdapterBundle", () => {
  it("en modo simulación siempre devuelve adaptadores simulados, sin importar credenciales", () => {
    const bundle = buildAdapterBundle({
      simulationMode: true,
      twilio: { accountSid: "ACxxx", authToken: "token" },
    });
    expect(bundle.telephony).toBeInstanceOf(SimulationTelephonyProvider);
  });

  it("fuera de simulación exige credenciales de Twilio", () => {
    expect(() => buildAdapterBundle({ simulationMode: false })).toThrow(/Twilio/);
  });

  it("fuera de simulación exige credenciales de OpenAI", () => {
    expect(() =>
      buildAdapterBundle({
        simulationMode: false,
        twilio: { accountSid: "ACxxx", authToken: "token" },
      }),
    ).toThrow(/OpenAI/);
  });

  it("fuera de simulación exige credenciales de GoHighLevel", () => {
    expect(() =>
      buildAdapterBundle({
        simulationMode: false,
        twilio: { accountSid: "ACxxx", authToken: "token" },
        openai: { apiKey: "sk-xxx", model: "gpt-4o-realtime-preview" },
      }),
    ).toThrow(/GoHighLevel/);
  });
});
