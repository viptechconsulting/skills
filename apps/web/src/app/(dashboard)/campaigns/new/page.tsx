"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/apiClient";

interface PhoneNumber {
  id: string;
  e164: string;
  label: string;
}
interface VoiceAgent {
  id: string;
  name: string;
}

export default function NewCampaignPage() {
  const router = useRouter();
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [voiceAgents, setVoiceAgents] = useState<VoiceAgent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    name: "",
    description: "",
    language: "es",
    objective: "",
    allowedWindowStart: "09:00",
    allowedWindowEnd: "19:00",
    timezoneDefault: "America/Mexico_City",
    outboundPhoneNumberId: "",
    maxAttempts: 3,
    attemptIntervalMinutes: 240,
    voiceAgentId: "",
    agentInstructions: "",
    bookingConditions: "",
    transferConditions: "",
    voicemailMessage: "",
    simulationMode: true,
    consentRequired: true,
    recordingEnabled: false,
  });

  useEffect(() => {
    api.get<{ phoneNumbers: PhoneNumber[] }>("/phone-numbers").then((d) => setPhoneNumbers(d.phoneNumbers));
    api.get<{ voiceAgents: VoiceAgent[] }>("/voice-agents").then((d) => setVoiceAgents(d.voiceAgents));
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { campaign } = await api.post<{ campaign: { id: string } }>("/campaigns", {
        ...form,
        allowedWindow: { start: form.allowedWindowStart, end: form.allowedWindowEnd },
        maxAttempts: Number(form.maxAttempts),
        attemptIntervalMinutes: Number(form.attemptIntervalMinutes),
      });
      router.push(`/campaigns/${campaign.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al crear la campaña");
    } finally {
      setLoading(false);
    }
  }

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold">Nueva campaña</h1>
      <form onSubmit={handleSubmit} className="card space-y-4">
        <div>
          <label className="label" htmlFor="c-name">Nombre</label>
          <input id="c-name" className="input" required value={form.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="c-description">Descripción</label>
          <textarea
            id="c-description"
            className="input"
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="c-objective">Objetivo de la llamada</label>
          <textarea
            id="c-objective"
            className="input"
            required
            value={form.objective}
            onChange={(e) => set("objective", e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="c-language">Idioma</label>
            <input
              id="c-language"
              className="input"
              required
              value={form.language}
              onChange={(e) => set("language", e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="c-timezone">Zona horaria predeterminada</label>
            <input
              id="c-timezone"
              className="input"
              required
              value={form.timezoneDefault}
              onChange={(e) => set("timezoneDefault", e.target.value)}
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
              value={form.allowedWindowStart}
              onChange={(e) => set("allowedWindowStart", e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="c-window-end">Horario permitido (fin)</label>
            <input
              id="c-window-end"
              className="input"
              type="time"
              value={form.allowedWindowEnd}
              onChange={(e) => set("allowedWindowEnd", e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="c-phone">Número de salida</label>
          <select
            id="c-phone"
            className="input"
            required
            value={form.outboundPhoneNumberId}
            onChange={(e) => set("outboundPhoneNumberId", e.target.value)}
          >
            <option value="">Selecciona un número</option>
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
            required
            value={form.voiceAgentId}
            onChange={(e) => set("voiceAgentId", e.target.value)}
          >
            <option value="">Selecciona un agente</option>
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
              value={form.maxAttempts}
              onChange={(e) => set("maxAttempts", Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label" htmlFor="c-interval">Intervalo entre intentos (min)</label>
            <input
              id="c-interval"
              className="input"
              type="number"
              min={5}
              value={form.attemptIntervalMinutes}
              onChange={(e) => set("attemptIntervalMinutes", Number(e.target.value))}
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="c-instructions">Instrucciones del agente</label>
          <textarea
            id="c-instructions"
            className="input"
            required
            rows={4}
            value={form.agentInstructions}
            onChange={(e) => set("agentInstructions", e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="c-booking">Condiciones para agendar</label>
          <textarea
            id="c-booking"
            className="input"
            value={form.bookingConditions}
            onChange={(e) => set("bookingConditions", e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="c-transfer">Condiciones para transferir</label>
          <textarea
            id="c-transfer"
            className="input"
            value={form.transferConditions}
            onChange={(e) => set("transferConditions", e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="c-voicemail">Mensaje de buzón de voz</label>
          <textarea
            id="c-voicemail"
            className="input"
            value={form.voicemailMessage}
            onChange={(e) => set("voicemailMessage", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.consentRequired}
              onChange={(e) => set("consentRequired", e.target.checked)}
            />
            Requiere consentimiento explícito
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.simulationMode}
              onChange={(e) => set("simulationMode", e.target.checked)}
            />
            Modo simulación (no marca teléfonos reales)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.recordingEnabled}
              onChange={(e) => set("recordingEnabled", e.target.checked)}
            />
            Habilitar grabación de llamadas (verifica requisitos legales)
          </label>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? "Creando..." : "Crear campaña"}
        </button>
      </form>
    </div>
  );
}
