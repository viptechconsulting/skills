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

  useEffect(() => {
    api.get<{ campaigns: Campaign[] }>("/campaigns").then((data) => setCampaigns(data.campaigns));
  }, []);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Campañas</h1>
        <Link href="/campaigns/new" className="btn-primary">
          Nueva campaña
        </Link>
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
            {campaigns?.map((c) => (
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
            {campaigns?.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-400">
                  Aún no hay campañas. Crea la primera.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
