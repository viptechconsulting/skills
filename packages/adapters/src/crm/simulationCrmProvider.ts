import { randomUUID } from "node:crypto";
import type { CreateOpportunityInput, CrmContact, CrmProvider } from "./CrmProvider.js";

/**
 * CRM en memoria para modo simulación y pruebas. No realiza llamadas de red.
 */
export class SimulationCrmProvider implements CrmProvider {
  private contactsByPhone = new Map<string, CrmContact>();
  private opportunities = new Map<string, { contactId: string; stageId: string; name: string }>();
  public notes: Array<{ contactId: string; note: string }> = [];

  async getContactByPhone(phoneE164: string): Promise<CrmContact | null> {
    return this.contactsByPhone.get(phoneE164) ?? null;
  }

  seedContact(contact: CrmContact): void {
    this.contactsByPhone.set(contact.phone, contact);
  }

  async updateContact(contactId: string, fields: Record<string, string>): Promise<void> {
    for (const contact of this.contactsByPhone.values()) {
      if (contact.id === contactId) {
        contact.fields = { ...contact.fields, ...fields };
      }
    }
  }

  async createOpportunity(input: CreateOpportunityInput): Promise<{ opportunityId: string }> {
    const opportunityId = randomUUID();
    this.opportunities.set(opportunityId, {
      contactId: input.contactId,
      stageId: input.pipelineStageId,
      name: input.name,
    });
    return { opportunityId };
  }

  async moveOpportunityStage(opportunityId: string, newStageId: string): Promise<void> {
    const opportunity = this.opportunities.get(opportunityId);
    if (opportunity) {
      opportunity.stageId = newStageId;
    }
  }

  async addNote(contactId: string, note: string): Promise<void> {
    this.notes.push({ contactId, note });
  }
}
