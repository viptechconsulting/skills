"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError } from "@/lib/apiClient";
import { StatCard } from "@/components/StatCard";

interface Campaign {
  id: string;
  name: string;
  description: string;
  status: "draft" | "active" | "paused" | "archived";
  language: string;
  objective: string;
  timezoneDefault: string;
  allowedWindowStart: string;
  allowedWindowEnd: string;
  maxAttempts: number;
  attemptIntervalMinutes: number;
  outboundPhoneNumberId: string;
  voiceAgentId: string;
  agentInstructions: string;
  bookingConditions: string;
  transferConditions: string;
  voicemailMessage: string;
  consentRequired: boolean;
  simulationMode: boolean;
  recordingEnabled: boolean;
}

interface Analytics {
  scheduled: number;
  attempted: number;
  realConversations: number;
  appointmentsBooked: number;
  voicemails: number;
  totalCostUsd: number;
}

interface PhoneNumberOption {
  id: string;
  e164: string;
  label: string;
}

interface VoiceAgentOption {
  id: string;
  name: string;
}

interface CampaignEditForm {
  name: string;
  description: string;
  objective: string;
  language: string;
  timezoneDefault: string;
  allowedWindowStart: string;
  allowedWindowEnd: string;
  maxAttempts: number;
  attemptIntervalMinutes: number;
  outboundPhoneNumberId: string;
  voiceAgentId: string;
  agentInstructions: string;
  bookingConditions: string;
  transferConditions: string;
  voicemailMessage: string;
  consentRequired: boolean;
  recordingEnabled: boolean;
}

function toEditForm(campaign: Campaign): CampaignEditForm {
  return {
    name: campaign.name,
    description: campaign.description,
    objective: campaign.objective,
    language: campaign.language,
    timezoneDefault: campaign.timezoneDefault,
    allowedWindowStart: campaign.allowedWindowStart,
    allowedWindowEnd: campaign.allowedWindowEnd,
    maxAttempts: campaign.maxAttempts,
    attemptIntervalMinutes: campaign.attemptIntervalMinutes,
    outboundPhoneNumberId: campaign.outboundPhoneNumberId,
    voiceAgentId: campaign.voiceAgentId,
    agentInstructions: campaign.agentInstructions,
    bookingConditions: campaign.bookingConditions,
    transferConditions: campaign.transferConditions,
    voicemailMessage: campaign.voicemailMessage,
    consentRequired: campaign.consentRequired,
    recordingEnabled: campaign.recordingEnabled,
  };
}

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumberOption[]>([]);
  const [voiceAgents, setVoiceAgents] = useState<VoiceAgentOption[]>([]);
  const [editForm, setEditForm] = useState<CampaignEditForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const { campaign } = await api.get<{ campaign: Campaign }>(`/campaigns/${params.id}`);
    setCampaign(campaign);
    setEditForm(toEditForm(campaign));
    const { analytics } = await api.get<{ analytics: Analytics }>(`/analytics/campaigns/${params.id}`);
    setAnalytics(analytics);
    const { phoneNumbers } = await api.get<{ phoneNumbers: PhoneNumberOption[] }>("/phone-numbers");
    setPhoneNumbers(phoneNumbers);
    const { voiceAgents } = await api.get<{ voiceAgents: VoiceAgentOption[] }>("/voice-agents");
    setVoiceAgents(voiceAgents);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof ApiError ? err.message : "Error al cargar la campaña"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function updateStatus(status: Campaign["status"]) {
    if (!campaign) return;
    await api.patch(`/campaigns/${campaign.id}`, { status });
    load();
  }

  async function toggleSimulationMode() {
    if (!campaign) return;
    await api.patch(`/campaigns/${campaign.id}`, { simulationMode: !campaign.simulationMode });
    load();
  }

  async function handleSaveEdit() {
    if (!campaign || !editForm) return;
    setError(null);
    setMessage(null);
    try {
      await api.patch(`/campaigns/${campaign.id}`, {
        ...editForm,
        allowedWindow: { start: editForm.allowedWindowStart, end: editForm.allowedWindowEnd },
        maxAttempts: Number(editForm.maxAttempts),
        attemptIntervalMinutes: Number(editForm.attemptIntervalMinutes),
      });
      setMessage("Campaña actualizada");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al guardar los cambios");
    }
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!campaign || !editForm) return <p className="text-sm text-slate-500">Cargando...</p>;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{campaign.name}</h1>
          <p className="text-sm text-slate-500">{campaign.description}</p>
        </div>
        <div className="flex gap-2">
          {campaign.status !== "active" && (
            <button className="btn-primary" onClick={() => updateStatus("active")}>
              Activar
            </button>
          )}
          {campaign.status === "active" && (
            <button className="btn-secondary" onClick={() => updateStatus("paused")}>
              Pausar
            </button>
          )}
          <button className="btn-secondary" onClick={toggleSimulationMode}>
            Cambiar a modo {campaign.simulationMode ? "Real" : "Simulación"}
          </button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Estado" value={campaign.status} />
        <StatCard label="Modo" value={campaign.simulationMode ? "Simulación" : "Real"} />
        <StatCard label="Ventana permitida" value={`${campaign.allowedWindowStart} - ${campaign.allowedWindowEnd}`} />
        <StatCard label="Máx. intentos" value={campaign.maxAttempts} />
      </div>

      {analytics && (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Programadas" value={analytics.scheduled} />
          <StatCard label="Intentadas" value={analytics.attempted} />
          <StatCard label="Conversaciones reales" value={analytics.realConversations} />
          <StatCard label="Buzones" value={analytics.voicemails} />
          <StatCard label="Citas agendadas" value={analytics.appointmentsBooked} />
          <StatCard label="Costo total" value={`$${analytics.totalCostUsd.toFixed(2)}`} />
        </div>
      )}

      {message && <p className="mb-4 text-sm text-emerald-600">{message}</p>}

      <div className="card">
        <h2 className="mb-3 font-semibold">Editar campaña</h2>
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="c-name">Nombre</label>
            <input
              id="c-name"
              className="input"
              value={editForm.name}
              onChange={(e) => setEditForm((f) => (f ? { ...f, name: e.target.value } : f))}
            />
          </div>
          <div>
            <label className="label" htmlFor="c-description">Descripción</label>
            <textarea
              id="c-description"
              className="input"
              value={editForm.description}
              onChange={(e) => setEditForm((f) => (f ? { ...f, description: e.target.value } : f))}
            />
          </div>
          <div>
            <label className="label" htmlFor="c-objective">Objetivo de la llamada</label>
            <textarea
              id="c-objective"
              className="input"
              value={editForm.objective}
              onChange={(e) => setEditForm((f) => (f ? { ...f, objective: e.target.value } : f))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="c-language">Idioma</label>
              <input
                id="c-language"
                className="input"
                value={editForm.language}
                onChange={(e) => setEditForm((f) => (f ? { ...f, language: e.target.value } : f))}
              />
            </div>
            <div>
              <label className="label" htmlFor="c-timezone">Zona horaria predeterminada</label>
              <input
                id="c-timezone"
                className="input"
                value={editForm.timezoneDefault}
                onChange={(e) => setEditForm((f) => (f ? { ...f, timezoneDefault: e.target.value } : f))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="c-window-start">Horario permitido (inicio)</label>
              <input
                id="c-window-start"
                className="input"
                type="time"
                value={editForm.allowedWindowStart}
                onChange={(e) => setEditForm((f) => (f ? { ...f, allowedWindowStart: e.target.value } : f))}
              />
            </div>
            <div>
              <label className="label" htmlFor="c-window-end">Horario permitido (fin)</label>
              <input
                id="c-window-end"
                className="input"
                type="time"
                value={editForm.allowedWindowEnd}
                onChange={(e) => setEditForm((f) => (f ? { ...f, allowedWindowEnd: e.target.value } : f))}
              />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="c-phone">Número de salida</label>
            <select
              id="c-phone"
              className="input"
              value={editForm.outboundPhoneNumberId}
              onChange={(e) => setEditForm((f) => (f ? { ...f, outboundPhoneNumberId: e.target.value } : f))}
            >
              {phoneNumbers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} ({p.e164})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="c-voice-agent">Agente de voz</label>
            <select
              id="c-voice-agent"
              className="input"
              value={editForm.voiceAgentId}
              onChange={(e) => setEditForm((f) => (f ? { ...f, voiceAgentId: e.target.value } : f))}
            >
              {voiceAgents.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="c-max-attempts">Máximo de intentos</label>
              <input
                id="c-max-attempts"
                className="input"
                type="number"
                min={1}
                max={10}
                value={editForm.maxAttempts}
                onChange={(e) => setEditForm((f) => (f ? { ...f, maxAttempts: Number(e.target.value) } : f))}
              />
            </div>
            <div>
              <label className="label" htmlFor="c-interval">Intervalo entre intentos (min)</label>
              <input
                id="c-interval"
                className="input"
                type="number"
                min={5}
                value={editForm.attemptIntervalMinutes}
                onChange={(e) => setEditForm((f) => (f ? { ...f, attemptIntervalMinutes: Number(e.target.value) } : f))}
              />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="c-instructions">Instrucciones del agente</label>
            <textarea
              id="c-instructions"
              className="input"
              rows={4}
              value={editForm.agentInstructions}
              onChange={(e) => setEditForm((f) => (f ? { ...f, agentInstructions: e.target.value } : f))}
            />
          </div>
          <div>
            <label className="label" htmlFor="c-booking">Condiciones para agendar</label>
            <textarea
              id="c-booking"
              className="input"
              value={editForm.bookingConditions}
              onChange={(e) => setEditForm((f) => (f ? { ...f, bookingConditions: e.target.value } : f))}
            />
          </div>
          <div>
            <label className="label" htmlFor="c-transfer">Condiciones para transferir</label>
            <textarea
              id="c-transfer"
              className="input"
              value={editForm.transferConditions}
              onChange={(e) => setEditForm((f) => (f ? { ...f, transferConditions: e.target.value } : f))}
            />
          </div>
          <div>
            <label className="label" htmlFor="c-voicemail">Mensaje de buzón de voz</label>
            <textarea
              id="c-voicemail"
              className="input"
              value={editForm.voicemailMessage}
              onChange={(e) => setEditForm((f) => (f ? { ...f, voicemailMessage: e.target.value } : f))}
            />
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editForm.consentRequired}
                onChange={(e) => setEditForm((f) => (f ? { ...f, consentRequired: e.target.checked } : f))}
              />
              Requiere consentimiento explícito
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editForm.recordingEnabled}
                onChange={(e) => setEditForm((f) => (f ? { ...f, recordingEnabled: e.target.checked } : f))}
              />
              Habilitar grabación de llamadas
            </label>
          </div>
          <button className="btn-primary" onClick={handleSaveEdit}>
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
}
