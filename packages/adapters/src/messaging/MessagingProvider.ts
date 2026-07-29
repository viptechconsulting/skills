export interface SendSmsInput {
  toE164: string;
  fromE164: string;
  body: string;
}

export interface MessagingProvider {
  sendSms(input: SendSmsInput): Promise<{ providerMessageId: string }>;
}
