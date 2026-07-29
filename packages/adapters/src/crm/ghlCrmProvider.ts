import type { CreateOpportunityInput, CrmContact, CrmProvider } from "./CrmProvider.js";

export interface GhlConfig {
  baseUrl: string;
  accessToken: string;
  locationId: string;
}

async function ghlFetch<T>(config: GhlConfig, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
      Version: "2021-07-28",
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`GoHighLevel API error ${response.status}: ${body}`);
  }

  return (await response.json()) as T;
}

export class GhlCrmProvider implements CrmProvider {
  constructor(private readonly config: GhlConfig) {}

  async getContactByPhone(phoneE164: string): Promise<CrmContact | null> {
    const result = await ghlFetch<{ contacts: Array<Record<string, unknown>> }>(
      this.config,
      `/contacts/search?locationId=${this.config.locationId}&query=${encodeURIComponent(phoneE164)}`,
    );

    const contact = result.contacts?.[0];
    if (!contact) return null;

    return {
      id: String(contact.id ?? ""),
      name: String(contact.name ?? contact.contactName ?? ""),
      phone: String(contact.phone ?? phoneE164),
      email: contact.email ? String(contact.email) : undefined,
      fields: (contact.customFields as Record<string, string>) ?? {},
    };
  }

  async updateContact(contactId: string, fields: Record<string, string>): Promise<void> {
    await ghlFetch(this.config, `/contacts/${contactId}`, {
      method: "PUT",
      body: JSON.stringify({ customFields: fields }),
    });
  }

  async createOpportunity(input: CreateOpportunityInput): Promise<{ opportunityId: string }> {
    const result = await ghlFetch<{ id: string }>(this.config, "/opportunities/", {
      method: "POST",
      body: JSON.stringify({
        contactId: input.contactId,
        pipelineStageId: input.pipelineStageId,
        name: input.name,
        monetaryValue: input.value,
        locationId: this.config.locationId,
      }),
    });
    return { opportunityId: result.id };
  }

  async moveOpportunityStage(opportunityId: string, newStageId: string): Promise<void> {
    await ghlFetch(this.config, `/opportunities/${opportunityId}`, {
      method: "PUT",
      body: JSON.stringify({ pipelineStageId: newStageId }),
    });
  }

  async addNote(contactId: string, note: string): Promise<void> {
    await ghlFetch(this.config, `/contacts/${contactId}/notes`, {
      method: "POST",
      body: JSON.stringify({ body: note }),
    });
  }
}
