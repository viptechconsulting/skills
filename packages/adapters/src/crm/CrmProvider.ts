export interface CrmContact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  fields: Record<string, string>;
}

export interface CreateOpportunityInput {
  contactId: string;
  pipelineStageId: string;
  name: string;
  value?: number;
}

/**
 * Una instancia de CrmProvider está ligada a las credenciales de UNA
 * organización (ver factory.ts). Nunca recibe credenciales por llamada,
 * evitando que una organización pueda, por error de programación, operar
 * sobre el CRM de otra.
 */
export interface CrmProvider {
  getContactByPhone(phoneE164: string): Promise<CrmContact | null>;
  updateContact(contactId: string, fields: Record<string, string>): Promise<void>;
  createOpportunity(input: CreateOpportunityInput): Promise<{ opportunityId: string }>;
  moveOpportunityStage(opportunityId: string, newStageId: string): Promise<void>;
  addNote(contactId: string, note: string): Promise<void>;
}
