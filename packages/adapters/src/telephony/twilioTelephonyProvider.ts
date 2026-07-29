import twilio from "twilio";
import type {
  OriginateCallInput,
  OriginateCallResult,
  TelephonyProvider,
  TransferCallInput,
} from "./TelephonyProvider.js";

export interface TwilioTelephonyConfig {
  accountSid: string;
  authToken: string;
}

export class TwilioTelephonyProvider implements TelephonyProvider {
  private readonly client: ReturnType<typeof twilio>;
  private readonly authToken: string;

  constructor(config: TwilioTelephonyConfig) {
    this.client = twilio(config.accountSid, config.authToken);
    this.authToken = config.authToken;
  }

  async originateCall(input: OriginateCallInput): Promise<OriginateCallResult> {
    const call = await this.client.calls.create({
      to: input.toE164,
      from: input.fromE164,
      url: input.answerWebhookUrl,
      statusCallback: input.statusCallbackUrl,
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      statusCallbackMethod: "POST",
      machineDetection: input.machineDetectionCallbackUrl ? "DetectMessageEnd" : undefined,
      asyncAmd: input.machineDetectionCallbackUrl ? "true" : undefined,
      asyncAmdStatusCallback: input.machineDetectionCallbackUrl,
      record: input.recordingEnabled,
      recordingStatusCallback: input.recordingEnabled ? input.recordingStatusCallbackUrl : undefined,
    });

    return { providerCallSid: call.sid };
  }

  async hangupCall(providerCallSid: string): Promise<void> {
    await this.client.calls(providerCallSid).update({ status: "completed" });
  }

  async transferCall(input: TransferCallInput): Promise<{ ok: boolean; error?: string }> {
    try {
      const twiml = new twilio.twiml.VoiceResponse();
      twiml.dial().number(input.transferToE164);
      await this.client.calls(input.providerCallSid).update({ twiml: twiml.toString() });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "unknown_error" };
    }
  }

  verifyWebhookSignature(input: {
    url: string;
    signatureHeader: string | undefined;
    params: Record<string, string>;
  }): boolean {
    if (!input.signatureHeader) {
      return false;
    }
    return twilio.validateRequest(this.authToken, input.signatureHeader, input.url, input.params);
  }

  buildMediaStreamTwiml(input: { mediaStreamWebSocketUrl: string; callId: string }): string {
    const twiml = new twilio.twiml.VoiceResponse();
    const connect = twiml.connect();
    const stream = connect.stream({ url: input.mediaStreamWebSocketUrl });
    stream.parameter({ name: "callId", value: input.callId });
    return twiml.toString();
  }
}
