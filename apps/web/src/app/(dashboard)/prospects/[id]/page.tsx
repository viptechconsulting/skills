"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/apiClient";

// Copia de apps/api: packages/shared/src/eligibility.ts ELIGIBILITY_REJECTION_MESSAGES.
// Duplicado aquí en vez de importar el barrel de @lynkro-outbound/shared porque ese
// paquete también reexporta módulos con dependencias de Node (crypto) que rompen el
// bundle de cliente de Next.js.
const ELIGIBILITY_REJECTION_MESSAGES: Record<string, string> = {
  INVALID_PHONE_NUMBER: "El número de teléfono no está en formato E.164 válido.",
  CONSENT_REQUIRED_NOT_GIVEN: "El prospecto no tiene consentimiento registrado.",
  DO_NOT_CALL_LISTED: "El número está en la lista Do Not Call de la organización.",
  CAMPAIGN_NOT_ACTIVE: "La campaña no está activa (pausada, en borrador o archivada).",
  OUTSIDE_ALLOWED_WINDOW: "La hora local del prospecto está fuera de la ventana permitida.",
  MAX_ATTEMPTS_REACHED: "Se alcanzó el número máximo de intentos configurado.",
  ACTIVE_CALL_IN_PROGRESS: "Ya existe una llamada activa (no terminal) para este prospecto.",
  FUTURE_APPOINTMENT_EXISTS: "El prospecto ya tiene una cita futura activa.",
  PROSPECT_BLOCKED: "El prospecto está bloqueado para futuras comunicaciones.",
};

interface Prospect {
  id: string;
  name: string;
  phoneE164: string;
  company: string;
  status: string;
  attemptCount: number;
  nextAttemptAt: string | null;
  finalOutcome: string | null;
  isBlocked: boolean;
  intent: string;
  desiredOutcome: string;
  context: string;
  campaignId: string | null;
}

interface CallSummary {
  id: string;
  status: string;
  outcome: string | null;
  createdAt: string;
  attemptNumber: number;
}

interface CampaignOption {
  id: string;
  name: string;
  simulationMode: boolean;
}

export default function ProspectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [calls, setCalls] = useState<CallSummary[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scheduleAt, setScheduleAt] = useState("");

  async function load() {
    const { prospect } = await api.get<{ prospect: Prospect }>(`/prospects/${params.id}`);
    setProspect(prospect);
    setSelectedCampaignId(prospect.campaignId ?? "");
    const { calls } = await api.get<{ calls: CallSummary[] }>(`/prospects/${params.id}/history`);
    setCalls(calls);
    const { campaigns } = await api.get<{ campaigns: CampaignOption[] }>("/campaigns");
    setCampaigns(campaigns);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof ApiError ? err.message : "Error al cargar el prospecto"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function runAction(action: () => Promise<unknown>, successMessage: string) {
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(successMessage);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? describeError(err) : "Ocurrió un error al ejecutar la acción");
    }
  }

  function describeError(err: ApiError): string {
    const reason = typeof err.body === "object" && err.body && "reason" in err.body ? (err.body as { reason: unknown }).reason : undefined;
    const humanReason = typeof reason === "string" ? ELIGIBILITY_REJECTION_MESSAGES[reason] : undefined;
    return humanReason ?? err.message;
  }

  async function handleDelete() {
    if (!prospect) return;
    if (!window.confirm(`¿Eliminar a "${prospect.name}" definitivamente? Esta acción no se puede deshacer.`)) return;
    setError(null);
    try {
      await api.delete(`/prospects/${prospect.id}`);
      router.push("/prospects");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(
          "No se puede eliminar: este prospecto ya tiene llamadas o citas registradas. Usa \"Bloquear comunicaciones\" en su lugar para preservar el historial.",
        );
      } else {
        setError(err instanceof ApiError ? err.message : "Error al eliminar el prospecto");
      }
    }
  }

  if (!prospect) return <p className="text-sm text-slate-500">Cargando...</p>;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{prospect.name}</h1>
        <p className="text-sm text-slate-500">
          {prospect.phoneE164} · {prospect.company}
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <button
          className="btn-primary"
          onClick={() => runAction(() => api.post(`/prospects/${prospect.id}/call-now`), "Llamada encolada")}
        >
          Llamar ahora
        </button>
        <button
          className="btn-secondary"
          onClick={() => runAction(() => api.post(`/prospects/${prospect.id}/retry`), "Reintento encolado")}
        >
          Volver a intentar
        </button>
        <button
          className="btn-secondary"
          onClick={() => runAction(() => api.post(`/prospects/${prospect.id}/cancel`), "Llamada cancelada")}
        >
          Cancelar llamada
        </button>
        <button
          className="btn-danger"
          onClick={() =>
            runAction(() => api.post(`/prospects/${prospect.id}/block`), "Prospecto bloqueado para futuras comunicaciones")
          }
        >
          Bloquear comunicaciones
        </button>
        <button className="btn-danger" onClick={handleDelete}>
          Eliminar prospecto
        </button>
      </div>

      <div className="card mb-6">
        <h2 className="mb-3 font-semibold">Campaña asignada</h2>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="label" htmlFor="p-campaign">Campaña</label>
            <select
              id="p-campaign"
              className="input"
              value={selectedCampaignId}
              onChange={(e) => setSelectedCampaignId(e.target.value)}
            >
              <option value="">Sin campaña</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.simulationMode ? "Simulación" : "Real"})
                </option>
              ))}
            </select>
          </div>
          <button
            className="btn-secondary"
            disabled={selectedCampaignId === (prospect.campaignId ?? "")}
            onClick={() =>
              runAction(
                () => api.patch(`/prospects/${prospect.id}`, { campaignId: selectedCampaignId || null }),
                "Campaña actualizada",
              )
            }
          >
            Reasignar
          </button>
        </div>
      </div>

      <div className="card mb-6">
        <h2 className="mb-3 font-semibold">Programar llamada</h2>
        <div className="flex items-end gap-3">
          <div>
            <label className="label">Fecha y hora</label>
            <input
              type="datetime-local"
              className="input"
              value={scheduleAt}
              onChange={(e) => setScheduleAt(e.target.value)}
            />
          </div>
          <button
            className="btn-primary"
            disabled={!scheduleAt}
            onClick={() =>
              runAction(
                () =>
                  api.post(`/prospects/${prospect.id}/schedule`, {
                    scheduledAtUtc: new Date(scheduleAt).toISOString(),
                  }),
                "Llamada programada",
              )
            }
          >
            Programar
          </button>
        </div>
      </div>

      {message && <p className="mb-4 text-sm text-emerald-600">{message}</p>}
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="card">
          <p className="text-xs uppercase text-slate-500">Estado</p>
          <p className="font-medium">{prospect.status}</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase text-slate-500">Intentos</p>
          <p className="font-medium">{prospect.attemptCount}</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase text-slate-500">Próximo intento</p>
          <p className="font-medium">{prospect.nextAttemptAt ? new Date(prospect.nextAttemptAt).toLocaleString() : "—"}</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase text-slate-500">Resultado final</p>
          <p className="font-medium">{prospect.finalOutcome ?? "—"}</p>
        </div>
      </div>

      <div className="card mb-6">
        <h2 className="mb-2 font-semibold">Intención y contexto</h2>
        <p className="text-sm text-slate-600">
          <strong>Intención:</strong> {prospect.intent}
        </p>
        <p className="mt-1 text-sm text-slate-600">
          <strong>Resultado deseado:</strong> {prospect.desiredOutcome}
        </p>
        {prospect.context && (
          <p className="mt-1 text-sm text-slate-600">
            <strong>Contexto:</strong> {prospect.context}
          </p>
        )}
      </div>

      <div className="card overflow-x-auto">
        <h2 className="mb-3 font-semibold">Historial de llamadas</h2>
        <table className="table-base">
          <thead>
            <tr>
              <th>Intento</th>
              <th>Estado</th>
              <th>Resultado</th>
              <th>Fecha</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {calls.map((c) => (
              <tr key={c.id}>
                <td>{c.attemptNumber}</td>
                <td>{c.status}</td>
                <td>{c.outcome ?? "—"}</td>
                <td>{new Date(c.createdAt).toLocaleString()}</td>
                <td>
                  <Link href={`/calls/${c.id}`} className="text-brand-600 hover:underline">
                    Ver
                  </Link>
                </td>
              </tr>
            ))}
            {calls.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-400">
                  Aún no hay llamadas registradas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
