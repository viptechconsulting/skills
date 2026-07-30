"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/apiClient";

interface CallEvent {
  id: string;
  type: string;
  causedBy: string;
  createdAt: string;
}

interface ToolExecution {
  id: string;
  toolName: string;
  authorized: boolean;
  errorMessage: string | null;
  createdAt: string;
}

interface TranscriptEntry {
  speaker: "agent" | "prospect";
  text: string;
  at: string;
}

interface Call {
  id: string;
  status: string;
  outcome: string | null;
  summary: string | null;
  nextStep: string | null;
  durationSeconds: number | null;
  costUsd: string | null;
  recordingUrl: string | null;
  transcript: TranscriptEntry[] | null;
  prospectId: string;
  prospect: { name: string; phoneE164: string };
  events: CallEvent[];
  toolExecutions: ToolExecution[];
}

const TERMINAL_CALL_STATUSES = [
  "completed",
  "failed",
  "canceled",
  "no_answer",
  "busy",
  "blocked",
  "eligibility_failed",
];

export default function CallDetailPage() {
  const params = useParams<{ id: string }>();
  const [call, setCall] = useState<Call | null>(null);
  const [error, setError] = useState<string | null>(null);
  const callRef = useRef<Call | null>(null);

  useEffect(() => {
    let cancelled = false;
    function load() {
      api
        .get<{ call: Call }>(`/calls/${params.id}`)
        .then((d) => {
          if (cancelled) return;
          callRef.current = d.call;
          setCall(d.call);
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof ApiError ? err.message : "Error al cargar la llamada");
        });
    }
    load();
    // Mientras la llamada siga en curso, refresca sola cada 3s en vez de
    // dejar al usuario mirando una foto fija del momento en que abrió la
    // página (el estado real puede haber avanzado varias veces desde entonces).
    const interval = setInterval(() => {
      if (callRef.current && !TERMINAL_CALL_STATUSES.includes(callRef.current.status)) {
        load();
      }
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [params.id]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!call) return <p className="text-sm text-slate-500">Cargando...</p>;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Llamada con {call.prospect.name}</h1>
        <Link href={`/prospects/${call.prospectId}`} className="text-sm text-brand-600 hover:underline">
          Ver contacto ({call.prospect.phoneE164})
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="card">
          <p className="text-xs uppercase text-slate-500">Estado</p>
          <p className="font-medium">{call.status}</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase text-slate-500">Resultado</p>
          <p className="font-medium">{call.outcome ?? "—"}</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase text-slate-500">Duración</p>
          <p className="font-medium">{call.durationSeconds ? `${call.durationSeconds}s` : "—"}</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase text-slate-500">Costo</p>
          <p className="font-medium">{call.costUsd ? `$${call.costUsd}` : "—"}</p>
        </div>
      </div>

      {call.summary && (
        <div className="card mb-6">
          <h2 className="mb-2 font-semibold">Resumen</h2>
          <p className="text-sm text-slate-600">{call.summary}</p>
          {call.nextStep && (
            <p className="mt-2 text-sm text-slate-600">
              <strong>Próximo paso:</strong> {call.nextStep}
            </p>
          )}
        </div>
      )}

      {call.recordingUrl && (
        <div className="card mb-6">
          <h2 className="mb-2 font-semibold">Grabación</h2>
          <audio controls src={call.recordingUrl} className="w-full" />
        </div>
      )}

      <div className="mb-6 grid gap-6 md:grid-cols-2">
        <div className="card">
          <h2 className="mb-3 font-semibold">Transcripción</h2>
          <div className="max-h-96 space-y-2 overflow-y-auto text-sm">
            {call.transcript?.map((entry, i) => (
              <p key={i}>
                <span className={`font-medium ${entry.speaker === "agent" ? "text-brand-700" : "text-slate-700"}`}>
                  {entry.speaker === "agent" ? "Agente: " : "Prospecto: "}
                </span>
                {entry.text}
              </p>
            ))}
            {(!call.transcript || call.transcript.length === 0) && (
              <p className="text-slate-400">Sin transcripción disponible.</p>
            )}
          </div>
        </div>

        <div className="card">
          <h2 className="mb-3 font-semibold">Línea de tiempo</h2>
          <ul className="max-h-96 space-y-2 overflow-y-auto text-sm">
            {call.events.map((e) => (
              <li key={e.id} className="border-b border-slate-100 pb-2">
                <p className="font-medium">{e.type}</p>
                <p className="text-xs text-slate-400">
                  {e.causedBy} · {new Date(e.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
            {call.events.length === 0 && <p className="text-slate-400">Sin eventos registrados.</p>}
          </ul>
        </div>
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold">Herramientas ejecutadas</h2>
        <table className="table-base">
          <thead>
            <tr>
              <th>Herramienta</th>
              <th>Autorizada</th>
              <th>Error</th>
              <th>Fecha</th>
            </tr>
          </thead>
          <tbody>
            {call.toolExecutions.map((t) => (
              <tr key={t.id}>
                <td>{t.toolName}</td>
                <td>{t.authorized ? "Sí" : "No"}</td>
                <td>{t.errorMessage ?? "—"}</td>
                <td>{new Date(t.createdAt).toLocaleString()}</td>
              </tr>
            ))}
            {call.toolExecutions.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-slate-400">
                  No se ejecutaron herramientas en esta llamada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
