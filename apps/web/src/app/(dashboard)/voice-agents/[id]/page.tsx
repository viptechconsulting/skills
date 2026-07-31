"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/apiClient";

interface VoiceAgent {
  id: string;
  name: string;
  persona: string;
  tone: string;
  defaultLanguage: string;
  voice: string;
  ttsProvider: "openai" | "elevenlabs";
  elevenLabsVoiceId: string | null;
}

interface DependentCampaign {
  id: string;
  name: string;
}

interface PhoneNumberOption {
  id: string;
  e164: string;
  label: string;
}

const VOICE_OPTIONS = ["alloy", "echo", "shimmer", "ash", "ballad", "coral", "sage", "verse", "marin", "cedar"];

export default function VoiceAgentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [form, setForm] = useState<VoiceAgent | null>(null);
  const [otherAgents, setOtherAgents] = useState<VoiceAgent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [dependentCampaigns, setDependentCampaigns] = useState<DependentCampaign[] | null>(null);
  const [reassignTargetId, setReassignTargetId] = useState("");
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumberOption[]>([]);
  const [testPhone, setTestPhone] = useState("");
  const [testOutboundId, setTestOutboundId] = useState("");
  const [testCallError, setTestCallError] = useState<string | null>(null);
  const [testCallLoading, setTestCallLoading] = useState(false);

  async function load() {
    const { voiceAgent } = await api.get<{ voiceAgent: VoiceAgent }>(`/voice-agents/${params.id}`);
    setForm(voiceAgent);
    const { voiceAgents } = await api.get<{ voiceAgents: VoiceAgent[] }>("/voice-agents");
    setOtherAgents(voiceAgents.filter((a) => a.id !== voiceAgent.id));
    const { phoneNumbers } = await api.get<{ phoneNumbers: PhoneNumberOption[] }>("/phone-numbers");
    setPhoneNumbers(phoneNumbers);
    setTestOutboundId((current) => current || phoneNumbers[0]?.id || "");
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof ApiError ? err.message : "Error al cargar el agente de voz"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function handleSave() {
    if (!form) return;
    setError(null);
    setMessage(null);
    try {
      await api.patch(`/voice-agents/${form.id}`, {
        name: form.name,
        persona: form.persona,
        tone: form.tone,
        defaultLanguage: form.defaultLanguage,
        voice: form.voice,
        ttsProvider: form.ttsProvider,
        elevenLabsVoiceId: form.ttsProvider === "elevenlabs" ? (form.elevenLabsVoiceId ?? "").trim() || undefined : undefined,
      });
      setMessage("Agente de voz actualizado");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al guardar los cambios");
    }
  }

  async function handleDelete() {
    if (!form) return;
    if (!window.confirm(`¿Eliminar el agente de voz "${form.name}"? Esta acción no se puede deshacer.`)) return;
    setError(null);
    try {
      await api.delete(`/voice-agents/${form.id}`);
      router.push("/voice-agents");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const campaigns = (err.body as { campaigns?: DependentCampaign[] })?.campaigns ?? [];
        if (campaigns.length > 0) {
          setDependentCampaigns(campaigns);
          setReassignTargetId("");
        } else {
          setError(`"${form.name}" está en uso por una o más campañas.`);
        }
      } else {
        setError(err instanceof ApiError ? err.message : "Error al eliminar el agente de voz");
      }
    }
  }

  async function handleConfirmReassign() {
    if (!form || !reassignTargetId) return;
    setError(null);
    try {
      await api.delete(`/voice-agents/${form.id}?reassignTo=${reassignTargetId}`);
      router.push("/voice-agents");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al reasignar y eliminar el agente de voz");
    }
  }

  async function handleTestCall() {
    if (!form || !testPhone.trim() || !testOutboundId) return;
    setTestCallError(null);
    setTestCallLoading(true);
    try {
      const { call } = await api.post<{ call: { id: string } }>(`/voice-agents/${form.id}/test-call`, {
        phone: testPhone.trim(),
        outboundPhoneNumberId: testOutboundId,
      });
      router.push(`/calls/${call.id}`);
    } catch (err) {
      setTestCallError(err instanceof ApiError ? err.message : "Error al iniciar la llamada de prueba");
    } finally {
      setTestCallLoading(false);
    }
  }

  if (error && !form) return <p className="text-sm text-red-600">{error}</p>;
  if (!form) return <p className="text-sm text-slate-500">Cargando...</p>;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{form.name}</h1>
          <Link href="/voice-agents" className="text-sm text-brand-600 hover:underline">
            ← Volver a agentes de voz
          </Link>
        </div>
        <button className="btn-secondary text-red-600" onClick={handleDelete}>
          Eliminar agente de voz
        </button>
      </div>

      {message && <p className="mb-4 text-sm text-emerald-600">{message}</p>}
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {dependentCampaigns && (
        <div className="card mb-6 space-y-3 border border-amber-300 bg-amber-50">
          <p className="text-sm text-slate-700">
            <strong>&quot;{form.name}&quot;</strong> está en uso por{" "}
            {dependentCampaigns.length === 1 ? "esta campaña" : "estas campañas"}:{" "}
            {dependentCampaigns.map((c) => c.name).join(", ")}. Elegí un agente de reemplazo para esas campañas y se
            eliminará &quot;{form.name}&quot; automáticamente.
          </p>
          <div className="flex items-center gap-2">
            <select
              className="input max-w-xs"
              value={reassignTargetId}
              onChange={(e) => setReassignTargetId(e.target.value)}
            >
              <option value="">Elegí un agente de reemplazo...</option>
              {otherAgents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <button className="btn-primary" disabled={!reassignTargetId} onClick={handleConfirmReassign}>
              Reasignar y eliminar
            </button>
            <button className="btn-secondary" onClick={() => setDependentCampaigns(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="card mb-6 space-y-3">
        <h2 className="font-semibold">Probar agente de voz</h2>
        <p className="text-sm text-slate-500">
          Recibí una llamada real con la voz, personalidad y tono configurados abajo, sin necesidad de una campaña
          ni un prospecto real.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input max-w-xs"
            placeholder="+1 555 123 4567"
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
          />
          <select className="input max-w-xs" value={testOutboundId} onChange={(e) => setTestOutboundId(e.target.value)}>
            {phoneNumbers.length === 0 && <option value="">Sin números de salida disponibles</option>}
            {phoneNumbers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} ({p.e164})
              </option>
            ))}
          </select>
          <button
            className="btn-primary"
            disabled={testCallLoading || !testPhone.trim() || !testOutboundId}
            onClick={handleTestCall}
          >
            {testCallLoading ? "Llamando..." : "Llamar ahora"}
          </button>
        </div>
        {testCallError && <p className="text-sm text-red-600">{testCallError}</p>}
      </div>

      <div className="card space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="va-name">Nombre</label>
            <input
              id="va-name"
              className="input"
              value={form.name}
              onChange={(e) => setForm((f) => (f ? { ...f, name: e.target.value } : f))}
            />
          </div>
          <div>
            <label className="label" htmlFor="va-voice">Voz</label>
            <input
              id="va-voice"
              className="input"
              list="voice-options"
              value={form.voice}
              onChange={(e) => setForm((f) => (f ? { ...f, voice: e.target.value } : f))}
            />
            <datalist id="voice-options">
              {VOICE_OPTIONS.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="va-tts-provider">Motor de voz</label>
            <select
              id="va-tts-provider"
              className="input"
              value={form.ttsProvider}
              onChange={(e) =>
                setForm((f) => (f ? { ...f, ttsProvider: e.target.value as "openai" | "elevenlabs" } : f))
              }
            >
              <option value="openai">OpenAI Realtime (campo &quot;Voz&quot; de arriba)</option>
              <option value="elevenlabs">ElevenLabs (acento más nativo)</option>
            </select>
          </div>
          {form.ttsProvider === "elevenlabs" && (
            <div>
              <label className="label" htmlFor="va-elevenlabs-voice-id">Voice ID de ElevenLabs</label>
              <input
                id="va-elevenlabs-voice-id"
                className="input"
                placeholder="Ej: 21m00Tcm4TlvDq8ikWAM"
                value={form.elevenLabsVoiceId ?? ""}
                onChange={(e) => setForm((f) => (f ? { ...f, elevenLabsVoiceId: e.target.value } : f))}
              />
            </div>
          )}
        </div>
        {form.ttsProvider === "elevenlabs" && (
          <p className="text-xs text-slate-500">
            Necesitás tener ElevenLabs conectado en <Link href="/integrations" className="text-brand-600 hover:underline">/integrations</Link>.
            Sin Voice ID configurado, la llamada usa la voz de OpenAI como respaldo.
          </p>
        )}
        <div>
          <label className="label" htmlFor="va-persona">Personalidad / identidad del agente</label>
          <textarea
            id="va-persona"
            className="input"
            rows={3}
            value={form.persona}
            onChange={(e) => setForm((f) => (f ? { ...f, persona: e.target.value } : f))}
          />
        </div>
        <div>
          <label className="label" htmlFor="va-tone">Tono y estilo de habla</label>
          <input
            id="va-tone"
            className="input"
            placeholder="Ej: Cálido y profesional, ritmo pausado, sin sonar a guion leído."
            value={form.tone}
            onChange={(e) => setForm((f) => (f ? { ...f, tone: e.target.value } : f))}
          />
        </div>
        <div>
          <label className="label" htmlFor="va-language">Idioma por defecto</label>
          <input
            id="va-language"
            className="input max-w-[8rem]"
            value={form.defaultLanguage}
            onChange={(e) => setForm((f) => (f ? { ...f, defaultLanguage: e.target.value } : f))}
          />
        </div>
        <button className="btn-primary" onClick={handleSave}>
          Guardar cambios
        </button>
      </div>
    </div>
  );
}
