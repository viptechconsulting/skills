"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/apiClient";

interface Prospect {
  id: string;
  name: string;
  phoneE164: string;
  company: string;
  status: string;
  attemptCount: number;
  nextAttemptAt: string | null;
  finalOutcome: string | null;
}

export default function ProspectsPage() {
  const [prospects, setProspects] = useState<Prospect[] | null>(null);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    const { prospects } = await api.get<{ prospects: Prospect[] }>("/prospects");
    setProspects(prospects);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportError(null);
    setImportResult(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const { result } = await api.postForm<{
        result: { totalRows: number; created: number; updatedDuplicates: number; rejected: number };
      }>("/prospects/import", form);
      setImportResult(
        `Procesadas ${result.totalRows} filas: ${result.created} creadas, ${result.updatedDuplicates} actualizadas, ${result.rejected} rechazadas.`,
      );
      load();
    } catch (err) {
      setImportError(err instanceof ApiError ? err.message : "Error al importar el CSV");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Prospectos</h1>
        <div className="flex gap-2">
          <input ref={fileInputRef} type="file" accept=".csv" className="hidden" id="csv-input" onChange={handleImport} />
          <label htmlFor="csv-input" className="btn-secondary cursor-pointer">
            Importar CSV
          </label>
          <Link href="/prospects/new" className="btn-primary">
            Nuevo prospecto
          </Link>
        </div>
      </div>

      {importResult && <p className="mb-4 text-sm text-emerald-600">{importResult}</p>}
      {importError && <p className="mb-4 text-sm text-red-600">{importError}</p>}

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Teléfono</th>
              <th>Empresa</th>
              <th>Estado</th>
              <th>Intentos</th>
              <th>Próximo intento</th>
              <th>Resultado final</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {prospects?.map((p) => (
              <tr key={p.id}>
                <td className="font-medium">{p.name}</td>
                <td>{p.phoneE164}</td>
                <td>{p.company}</td>
                <td>
                  <span className="badge bg-slate-100 text-slate-700">{p.status}</span>
                </td>
                <td>{p.attemptCount}</td>
                <td>{p.nextAttemptAt ? new Date(p.nextAttemptAt).toLocaleString() : "—"}</td>
                <td>{p.finalOutcome ?? "—"}</td>
                <td>
                  <Link href={`/prospects/${p.id}`} className="text-brand-600 hover:underline">
                    Ver
                  </Link>
                </td>
              </tr>
            ))}
            {prospects?.length === 0 && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-slate-400">
                  Aún no hay prospectos. Crea uno o importa un CSV.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
