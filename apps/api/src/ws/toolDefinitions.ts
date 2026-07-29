import type { RealtimeToolDefinition } from "@lynkro-outbound/adapters";

/**
 * Definiciones JSON Schema de las herramientas expuestas al modelo de
 * OpenAI Realtime. NO incluyen `callId`: el bridge (twilioMediaBridge.ts)
 * lo inyecta automáticamente en cada tool call antes de validarlo con los
 * schemas Zod de packages/shared, porque el modelo no conoce (ni debe
 * conocer) identificadores internos de base de datos.
 */
export const REALTIME_TOOL_DEFINITIONS: RealtimeToolDefinition[] = [
  {
    name: "get_calendar_availability",
    description: "Consulta horarios reales disponibles en el calendario para agendar una cita.",
    parameters: {
      type: "object",
      properties: {
        earliestStartUtc: { type: "string", format: "date-time", description: "Instante UTC más temprano aceptable" },
        durationMinutes: { type: "integer", minimum: 15, maximum: 240, default: 30 },
      },
      required: ["earliestStartUtc"],
    },
  },
  {
    name: "book_appointment",
    description: "Reserva una cita en el horario confirmado en voz alta con el prospecto (fecha, hora y zona horaria).",
    parameters: {
      type: "object",
      properties: {
        confirmedSlot: {
          type: "object",
          properties: {
            startUtc: { type: "string", format: "date-time" },
            endUtc: { type: "string", format: "date-time" },
          },
          required: ["startUtc", "endUtc"],
        },
        timezone: { type: "string" },
        notes: { type: "string" },
      },
      required: ["confirmedSlot", "timezone"],
    },
  },
  {
    name: "reschedule_appointment",
    description: "Reprograma una cita existente a un nuevo horario.",
    parameters: {
      type: "object",
      properties: {
        appointmentId: { type: "string" },
        newSlot: {
          type: "object",
          properties: {
            startUtc: { type: "string", format: "date-time" },
            endUtc: { type: "string", format: "date-time" },
          },
          required: ["startUtc", "endUtc"],
        },
        timezone: { type: "string" },
      },
      required: ["appointmentId", "newSlot", "timezone"],
    },
  },
  {
    name: "cancel_appointment",
    description: "Cancela una cita existente.",
    parameters: {
      type: "object",
      properties: { appointmentId: { type: "string" }, reason: { type: "string" } },
      required: ["appointmentId"],
    },
  },
  {
    name: "get_crm_contact",
    description: "Obtiene la información del contacto en el CRM.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "update_crm_contact",
    description: "Actualiza campos del contacto en el CRM.",
    parameters: {
      type: "object",
      properties: { fields: { type: "object", additionalProperties: { type: "string" } } },
      required: ["fields"],
    },
  },
  {
    name: "create_opportunity",
    description: "Crea una nueva oportunidad de venta en el CRM.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        pipelineStage: { type: "string" },
        value: { type: "number" },
      },
      required: ["name", "pipelineStage"],
    },
  },
  {
    name: "move_opportunity_stage",
    description: "Mueve una oportunidad existente a otra etapa del pipeline.",
    parameters: {
      type: "object",
      properties: { opportunityId: { type: "string" }, newStage: { type: "string" } },
      required: ["opportunityId", "newStage"],
    },
  },
  {
    name: "add_call_note",
    description: "Agrega una nota al contacto en el CRM con un resumen relevante de la llamada.",
    parameters: {
      type: "object",
      properties: { note: { type: "string" } },
      required: ["note"],
    },
  },
  {
    name: "send_confirmation_sms",
    description: "Envía un SMS de confirmación de la cita agendada.",
    parameters: {
      type: "object",
      properties: { message: { type: "string" } },
      required: ["message"],
    },
  },
  {
    name: "send_follow_up_sms",
    description: "Envía un SMS de seguimiento al prospecto.",
    parameters: {
      type: "object",
      properties: { message: { type: "string" }, delayMinutes: { type: "integer", minimum: 0 } },
      required: ["message"],
    },
  },
  {
    name: "schedule_callback",
    description: "Programa una devolución de llamada en un horario futuro.",
    parameters: {
      type: "object",
      properties: { callbackAtUtc: { type: "string", format: "date-time" }, reason: { type: "string" } },
      required: ["callbackAtUtc"],
    },
  },
  {
    name: "transfer_to_human",
    description: "Transfiere la llamada en curso a una persona humana disponible.",
    parameters: {
      type: "object",
      properties: { reason: { type: "string" } },
      required: ["reason"],
    },
  },
  {
    name: "mark_do_not_call",
    description:
      "Marca al prospecto como Do Not Call de forma inmediata y permanente. Usar en cuanto el prospecto pida no recibir más llamadas.",
    parameters: {
      type: "object",
      properties: { reason: { type: "string" } },
      required: ["reason"],
    },
  },
  {
    name: "end_call",
    description:
      "Termina la llamada. Es la ÚNICA forma de finalizar la conversación y SIEMPRE requiere un resultado estructurado válido.",
    parameters: {
      type: "object",
      properties: {
        outcome: {
          type: "string",
          enum: [
            "BOOKED",
            "QUALIFIED_NOT_BOOKED",
            "CALLBACK_REQUESTED",
            "TRANSFERRED",
            "NOT_INTERESTED",
            "DO_NOT_CALL",
            "WRONG_NUMBER",
            "VOICEMAIL",
            "NO_ANSWER",
            "BUSY",
            "FAILED",
          ],
        },
        summary: { type: "string" },
        nextStep: { type: "string" },
      },
      required: ["outcome", "summary"],
    },
  },
];
