"use client";

import { useEffect, useState } from "react";
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

export default function VoiceAgentsPage() {
  const [agents, setAgents] = useState<VoiceAgent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", persona: "", tone: "", defaultLanguage: "es", voice: "alloy" });

  async function load() {
    const { voiceAgents } = await api.get<{ voiceAgents: VoiceAgent[] }>("/voice-agents");
    setAgents(voiceAgents);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await api.post("/voice-agents", form);
      setForm({ name: "", persona: "", tone: "", defaultLanguage: "es", voice: "alloy" });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al crear el agente de voz");
    }
  }

  async function handleDelete(agent: VoiceAgent) {
    if (!window.confirm(`¿Eliminar el agente de voz "${agent.name}"? Esta acción no se puede deshacer.`)) return;
    setDeleteError(null);
    try {
      await api.delete(`/voice-agents/${agent.id}`);
      load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setDeleteError(
          `"${agent.name}" está en uso por una o más campañas. Cambiá el agente de voz de esas campañas antes de eliminarlo.`,
        );
      } else {
        setDeleteError(err instanceof ApiError ? err.message : "Error al eliminar el agente de voz");
      }
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Agentes de voz</h1>

      <form onSubmit={handleAdd} className="card mb-6 space-y-3">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="va-name">Nombre</label>
            <input
              id="va-name"
              className="input"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="label" htmlFor="va-voice">Voz</label>
            <input
              id="va-voice"
              className="input"
              list="voice-options"
              value={form.voice}
              onChange={(e) => setForm((f) => ({ ...f, voice: e.target.value }))}
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
            required
            placeholder="Ej: Cercana, clara y respetuosa del tiempo del prospecto. Nunca se hace pasar por humana."
            value={form.persona}
            onChange={(e) => setForm((f) => ({ ...f, persona: e.target.value }))}
          />
        </div>
        <div>
          <label className="label" htmlFor="va-tone">Tono y estilo de habla</label>
          <input
            id="va-tone"
            className="input"
            placeholder="Ej: Cálido y profesional, ritmo pausado, sin sonar a guion leído."
            value={form.tone}
            onChange={(e) => setForm((f) => ({ ...f, tone: e.target.value }))}
          />
        </div>
        <div>
          <label className="label" htmlFor="va-language">Idioma por defecto</label>
          <input
            id="va-language"
            className="input max-w-[8rem]"
            value={form.defaultLanguage}
            onChange={(e) => setForm((f) => ({ ...f, defaultLanguage: e.target.value }))}
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" className="btn-primary">
          Crear agente de voz
        </button>
      </form>

      {deleteError && <p className="mb-4 text-sm text-red-600">{deleteError}</p>}

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Idioma</th>
              <th>Voz</th>
              <th>Personalidad</th>
              <th>Tono</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {agents?.map((a) => (
              <tr key={a.id}>
                <td className="font-medium">{a.name}</td>
                <td>{a.defaultLanguage}</td>
                <td>{a.voice}</td>
                <td className="max-w-xs truncate">{a.persona}</td>
                <td className="max-w-xs truncate">{a.tone || "—"}</td>
                <td className="whitespace-nowrap">
                  <Link href={`/voice-agents/${a.id}`} className="text-brand-600 hover:underline">
                    Editar
                  </Link>
                  {" · "}
                  <button className="text-red-600 hover:underline" onClick={() => handleDelete(a)}>
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
            {agents?.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-400">
                  Aún no hay agentes de voz.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
