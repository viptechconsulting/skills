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
  allowedWindowStart: string;
  allowedWindowEnd: string;
  maxAttempts: number;
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

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { campaign } = await api.get<{ campaign: Campaign }>(`/campaigns/${params.id}`);
    setCampaign(campaign);
    const { analytics } = await api.get<{ analytics: Analytics }>(`/analytics/campaigns/${params.id}`);
    setAnalytics(analytics);
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

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!campaign) return <p className="text-sm text-slate-500">Cargando...</p>;

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

      <div className="card">
        <h2 className="mb-2 font-semibold">Objetivo</h2>
        <p className="text-sm text-slate-600">{campaign.objective}</p>
      </div>
    </div>
  );
}
