"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/apiClient";
import { StatCard } from "@/components/StatCard";

interface Analytics {
  scheduled: number;
  attempted: number;
  answeredByHuman: number;
  voicemails: number;
  realConversations: number;
  qualifiedProspects: number;
  appointmentsBooked: number;
  transfers: number;
  callbacksRequested: number;
  notInterested: number;
  doNotCallRequests: number;
  averageDurationSeconds: number | null;
  totalCostUsd: number;
  costPerConversationUsd: number | null;
  costPerAppointmentUsd: number | null;
}

export default function DashboardPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);

  useEffect(() => {
    api.get<{ analytics: Analytics }>("/analytics/organization").then((data) => setAnalytics(data.analytics));
  }, []);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Analítica de la organización</h1>
      {!analytics ? (
        <p className="text-sm text-slate-500">Cargando analítica...</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Programadas" value={analytics.scheduled} />
          <StatCard label="Intentadas" value={analytics.attempted} />
          <StatCard label="Contestadas por persona" value={analytics.answeredByHuman} />
          <StatCard label="Buzones de voz" value={analytics.voicemails} />
          <StatCard label="Conversaciones reales" value={analytics.realConversations} />
          <StatCard label="Prospectos calificados" value={analytics.qualifiedProspects} />
          <StatCard label="Citas agendadas" value={analytics.appointmentsBooked} />
          <StatCard label="Transferencias" value={analytics.transfers} />
          <StatCard label="Callbacks solicitados" value={analytics.callbacksRequested} />
          <StatCard label="No interesados" value={analytics.notInterested} />
          <StatCard label="Solicitudes Do Not Call" value={analytics.doNotCallRequests} />
          <StatCard
            label="Duración promedio"
            value={analytics.averageDurationSeconds ? `${Math.round(analytics.averageDurationSeconds)}s` : "—"}
          />
          <StatCard label="Costo total" value={`$${analytics.totalCostUsd.toFixed(2)}`} />
          <StatCard
            label="Costo por conversación"
            value={analytics.costPerConversationUsd ? `$${analytics.costPerConversationUsd.toFixed(2)}` : "—"}
          />
          <StatCard
            label="Costo por cita"
            value={analytics.costPerAppointmentUsd ? `$${analytics.costPerAppointmentUsd.toFixed(2)}` : "—"}
          />
        </div>
      )}
    </div>
  );
}
