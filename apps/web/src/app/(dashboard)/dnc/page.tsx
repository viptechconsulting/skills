"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/apiClient";

interface DncEntry {
  id: string;
  phoneE164: string;
  reason: string;
  source: string;
  createdAt: string;
}

export default function DncPage() {
  const [entries, setEntries] = useState<DncEntry[] | null>(null);
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { entries } = await api.get<{ entries: DncEntry[] }>("/dnc");
    setEntries(entries);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await api.post("/dnc", { phone, reason });
      setPhone("");
      setReason("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al agregar a la lista Do Not Call");
    }
  }

  async function handleRemove(id: string) {
    await api.delete(`/dnc/${id}`);
    load();
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Lista Do Not Call</h1>

      <form onSubmit={handleAdd} className="card mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="dnc-phone">Teléfono (E.164)</label>
          <input
            id="dnc-phone"
            className="input"
            required
            placeholder="+14155552671"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div className="flex-1">
          <label className="label" htmlFor="dnc-reason">Motivo</label>
          <input id="dnc-reason" className="input" required value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <button type="submit" className="btn-primary">
          Agregar a DNC
        </button>
      </form>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Teléfono</th>
              <th>Motivo</th>
              <th>Origen</th>
              <th>Fecha</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {entries?.map((e) => (
              <tr key={e.id}>
                <td>{e.phoneE164}</td>
                <td>{e.reason}</td>
                <td>{e.source}</td>
                <td>{new Date(e.createdAt).toLocaleString()}</td>
                <td>
                  <button className="btn-danger" onClick={() => handleRemove(e.id)}>
                    Quitar
                  </button>
                </td>
              </tr>
            ))}
            {entries?.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-400">
                  La lista Do Not Call está vacía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
