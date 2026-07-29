"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/apiClient";

interface PhoneNumber {
  id: string;
  e164: string;
  label: string;
  isActive: boolean;
}

export default function PhoneNumbersPage() {
  const [numbers, setNumbers] = useState<PhoneNumber[] | null>(null);
  const [e164, setE164] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { phoneNumbers } = await api.get<{ phoneNumbers: PhoneNumber[] }>("/phone-numbers");
    setNumbers(phoneNumbers);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await api.post("/phone-numbers", { e164, label });
      setE164("");
      setLabel("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al agregar el número");
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Números telefónicos</h1>

      <form onSubmit={handleAdd} className="card mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="e164">Número (E.164)</label>
          <input
            id="e164"
            className="input"
            required
            placeholder="+14155552671"
            value={e164}
            onChange={(e) => setE164(e.target.value)}
          />
        </div>
        <div className="flex-1">
          <label className="label" htmlFor="label">Etiqueta</label>
          <input id="label" className="input" required value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <button type="submit" className="btn-primary">
          Agregar número
        </button>
      </form>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Número</th>
              <th>Etiqueta</th>
              <th>Activo</th>
            </tr>
          </thead>
          <tbody>
            {numbers?.map((n) => (
              <tr key={n.id}>
                <td>{n.e164}</td>
                <td>{n.label}</td>
                <td>{n.isActive ? "Sí" : "No"}</td>
              </tr>
            ))}
            {numbers?.length === 0 && (
              <tr>
                <td colSpan={3} className="py-6 text-center text-slate-400">
                  Aún no hay números configurados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
