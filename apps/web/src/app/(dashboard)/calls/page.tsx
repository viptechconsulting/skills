"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/apiClient";

interface Call {
  id: string;
  status: string;
  outcome: string | null;
  attemptNumber: number;
  createdAt: string;
  prospect: { name: string; phoneE164: string };
}

export default function CallsPage() {
  const [calls, setCalls] = useState<Call[] | null>(null);

  useEffect(() => {
    api.get<{ calls: Call[] }>("/calls").then((d) => setCalls(d.calls));
  }, []);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Llamadas</h1>
      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Prospecto</th>
              <th>Teléfono</th>
              <th>Intento</th>
              <th>Estado</th>
              <th>Resultado</th>
              <th>Fecha</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {calls?.map((c) => (
              <tr key={c.id}>
                <td className="font-medium">{c.prospect?.name}</td>
                <td>{c.prospect?.phoneE164}</td>
                <td>{c.attemptNumber}</td>
                <td>
                  <span className="badge bg-slate-100 text-slate-700">{c.status}</span>
                </td>
                <td>{c.outcome ?? "—"}</td>
                <td>{new Date(c.createdAt).toLocaleString()}</td>
                <td>
                  <Link href={`/calls/${c.id}`} className="text-brand-600 hover:underline">
                    Ver
                  </Link>
                </td>
              </tr>
            ))}
            {calls?.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-slate-400">
                  Aún no hay llamadas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
