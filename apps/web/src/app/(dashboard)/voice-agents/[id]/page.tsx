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

const VOICE_OPTIONS = ["alloy", "echo", "shimmer", "ash", "ballad", "coral", "sage", "verse", "marin", "cedar"];

export default function VoiceAgentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [form, setForm] = useState<VoiceAgent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const { voiceAgent } = await api.get<{ voiceAgent: VoiceAgent }>(`/voice-agents/${params.id}`);
    setForm(voiceAgent);
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
        setError(`"${form.name}" está en uso por una o más campañas. Cambiá el agente de voz de esas campañas antes de eliminarlo.`);
      } else {
        setError(err instanceof ApiError ? err.message : "Error al eliminar el agente de voz");
      }
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
