"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/apiClient";

interface Campaign {
  id: string;
  name: string;
}

export default function NewProspectPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    name: "",
    phone: "",
    defaultCountry: "",
    company: "",
    email: "",
    language: "es",
    timezone: "America/Mexico_City",
    context: "",
    intent: "",
    desiredOutcome: "",
    source: "manual",
    consentGiven: false,
    campaignId: "",
  });

  useEffect(() => {
    api.get<{ campaigns: Campaign[] }>("/campaigns").then((d) => setCampaigns(d.campaigns));
  }, []);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { prospect } = await api.post<{ prospect: { id: string } }>("/prospects", {
        ...form,
        defaultCountry: form.defaultCountry || undefined,
        campaignId: form.campaignId || undefined,
        email: form.email || undefined,
      });
      router.push(`/prospects/${prospect.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al crear el prospecto");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold">Nuevo prospecto</h1>
      <form onSubmit={handleSubmit} className="card space-y-4">
        <div>
          <label className="label" htmlFor="p-name">Nombre</label>
          <input id="p-name" className="input" required value={form.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="p-phone">Teléfono</label>
            <input
              id="p-phone"
              className="input"
              required
              placeholder="+14155552671"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="p-country">País por defecto (si el número no incluye código)</label>
            <input
              id="p-country"
              className="input"
              placeholder="MX"
              maxLength={2}
              value={form.defaultCountry}
              onChange={(e) => set("defaultCountry", e.target.value.toUpperCase())}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="p-company">Empresa</label>
            <input id="p-company" className="input" value={form.company} onChange={(e) => set("company", e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="p-email">Email (opcional)</label>
            <input
              id="p-email"
              className="input"
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="p-language">Idioma</label>
            <input
              id="p-language"
              className="input"
              required
              value={form.language}
              onChange={(e) => set("language", e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="p-timezone">Zona horaria</label>
            <input
              id="p-timezone"
              className="input"
              required
              value={form.timezone}
              onChange={(e) => set("timezone", e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="p-campaign">Campaña</label>
          <select id="p-campaign" className="input" value={form.campaignId} onChange={(e) => set("campaignId", e.target.value)}>
            <option value="">Sin asignar</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="p-context">Contexto previo</label>
          <textarea id="p-context" className="input" value={form.context} onChange={(e) => set("context", e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="p-intent">Intención exacta de la llamada</label>
          <textarea
            id="p-intent"
            className="input"
            required
            value={form.intent}
            onChange={(e) => set("intent", e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="p-desired-outcome">Resultado deseado</label>
          <textarea
            id="p-desired-outcome"
            className="input"
            required
            value={form.desiredOutcome}
            onChange={(e) => set("desiredOutcome", e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="p-source">Origen del prospecto</label>
          <input id="p-source" className="input" required value={form.source} onChange={(e) => set("source", e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.consentGiven} onChange={(e) => set("consentGiven", e.target.checked)} />
          Tengo evidencia de que el prospecto autorizó recibir esta llamada
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? "Guardando..." : "Guardar prospecto"}
        </button>
      </form>
    </div>
  );
}
