import twilio from "twilio";
import type { MessagingProvider, SendSmsInput } from "./MessagingProvider.js";

export interface TwilioMessagingConfig {
  accountSid: string;
  authToken: string;
}

export class TwilioMessagingProvider implements MessagingProvider {
  private readonly client: ReturnType<typeof twilio>;

  constructor(config: TwilioMessagingConfig) {
    this.client = twilio(config.accountSid, config.authToken);
  }

  async sendSms(input: SendSmsInput): Promise<{ providerMessageId: string }> {
    const message = await this.client.messages.create({
      to: input.toE164,
      from: input.fromE164,
      body: input.body,
    });
    return { providerMessageId: message.sid };
  }
}
