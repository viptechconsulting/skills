import { describe, expect, it } from "vitest";
import twilio from "twilio";
import { TwilioTelephonyProvider } from "./twilioTelephonyProvider.js";

describe("TwilioTelephonyProvider.verifyWebhookSignature", () => {
  const authToken = "test_auth_token_1234567890";
  const url = "https://example.com/webhooks/twilio/voice-status";
  const params = { CallSid: "CA123", CallStatus: "completed" };

  it("acepta una firma válida generada por el propio SDK de Twilio", () => {
    const provider = new TwilioTelephonyProvider({ accountSid: "ACxxx", authToken });
    const validSignature = twilio.getExpectedTwilioSignature(authToken, url, params);

    const result = provider.verifyWebhookSignature({ url, signatureHeader: validSignature, params });
    expect(result).toBe(true);
  });

  it("rechaza una firma inválida", () => {
    const provider = new TwilioTelephonyProvider({ accountSid: "ACxxx", authToken });
    const result = provider.verifyWebhookSignature({
      url,
      signatureHeader: "firma-completamente-invalida",
      params,
    });
    expect(result).toBe(false);
  });

  it("rechaza cuando no hay encabezado de firma", () => {
    const provider = new TwilioTelephonyProvider({ accountSid: "ACxxx", authToken });
    const result = provider.verifyWebhookSignature({ url, signatureHeader: undefined, params });
    expect(result).toBe(false);
  });

  it("rechaza si el token usado para verificar no coincide con el que firmó", () => {
    const signingProvider = new TwilioTelephonyProvider({ accountSid: "ACxxx", authToken });
    const validSignature = twilio.getExpectedTwilioSignature(authToken, url, params);

    const verifyingProvider = new TwilioTelephonyProvider({ accountSid: "ACxxx", authToken: "otro_token" });
    const result = verifyingProvider.verifyWebhookSignature({ url, signatureHeader: validSignature, params });
    expect(result).toBe(false);
    void signingProvider;
  });
});
