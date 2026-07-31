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
}

interface DependentCampaign {
  id: string;
  name: string;
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

  async function load() {
    const { voiceAgent } = await api.get<{ voiceAgent: VoiceAgent }>(`/voice-agents/${params.id}`);
    setForm(voiceAgent);
    const { voiceAgents } = await api.get<{ voiceAgents: VoiceAgent[] }>("/voice-agents");
    setOtherAgents(voiceAgents.filter((a) => a.id !== voiceAgent.id));
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
