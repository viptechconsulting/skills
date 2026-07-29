"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/apiClient";

interface VoiceAgent {
  id: string;
  name: string;
  persona: string;
  defaultLanguage: string;
  voice: string;
}

export default function VoiceAgentsPage() {
  const [agents, setAgents] = useState<VoiceAgent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", persona: "", defaultLanguage: "es", voice: "alloy" });

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
      setForm({ name: "", persona: "", defaultLanguage: "es", voice: "alloy" });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al crear el agente de voz");
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
              value={form.voice}
              onChange={(e) => setForm((f) => ({ ...f, voice: e.target.value }))}
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="va-persona">Persona / identidad del agente</label>
          <textarea
            id="va-persona"
            className="input"
            required
            value={form.persona}
            onChange={(e) => setForm((f) => ({ ...f, persona: e.target.value }))}
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" className="btn-primary">
          Crear agente de voz
        </button>
      </form>

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Idioma</th>
              <th>Voz</th>
              <th>Persona</th>
            </tr>
          </thead>
          <tbody>
            {agents?.map((a) => (
              <tr key={a.id}>
                <td className="font-medium">{a.name}</td>
                <td>{a.defaultLanguage}</td>
                <td>{a.voice}</td>
                <td className="max-w-xs truncate">{a.persona}</td>
              </tr>
            ))}
            {agents?.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-slate-400">
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
