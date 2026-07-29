import { randomUUID } from "node:crypto";
import type { MessagingProvider, SendSmsInput } from "./MessagingProvider.js";

export class SimulationMessagingProvider implements MessagingProvider {
  public sentMessages: SendSmsInput[] = [];

  async sendSms(input: SendSmsInput): Promise<{ providerMessageId: string }> {
    this.sentMessages.push(input);
    return { providerMessageId: `SIMSMS_${randomUUID()}` };
  }
}
