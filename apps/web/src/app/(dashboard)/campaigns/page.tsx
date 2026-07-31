"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Campaign {
  id: string;
  name: string;
  status: string;
  language: string;
  maxAttempts: number;
  simulationMode: boolean;
}

import { api } from "@/lib/apiClient";

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    api.get<{ campaigns: Campaign[] }>("/campaigns").then((data) => setCampaigns(data.campaigns));
  }, []);

  const visibleCampaigns = campaigns?.filter((c) => showArchived || c.status !== "archived");

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Campañas</h1>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Mostrar archivadas
          </label>
          <Link href="/campaigns/new" className="btn-primary">
            Nueva campaña
          </Link>
        </div>
      </div>
      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Estado</th>
              <th>Idioma</th>
              <th>Máx. intentos</th>
              <th>Modo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visibleCampaigns?.map((c) => (
              <tr key={c.id}>
                <td className="font-medium">{c.name}</td>
                <td>
                  <span className="badge bg-slate-100 text-slate-700">{c.status}</span>
                </td>
                <td>{c.language}</td>
                <td>{c.maxAttempts}</td>
                <td>{c.simulationMode ? "Simulación" : "Real"}</td>
                <td>
                  <Link href={`/campaigns/${c.id}`} className="text-brand-600 hover:underline">
                    Ver
                  </Link>
                </td>
              </tr>
            ))}
            {visibleCampaigns?.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-400">
                  {campaigns?.length === 0
                    ? "Aún no hay campañas. Crea la primera."
                    : "No hay campañas activas. Activá \"Mostrar archivadas\" para verlas."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
