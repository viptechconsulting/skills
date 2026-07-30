"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/apiClient";

type Provider = "twilio" | "openai" | "gohighlevel";

const PROVIDER_FIELDS: Record<Provider, { key: string; label: string }[]> = {
  twilio: [
    { key: "accountSid", label: "Account SID" },
    { key: "authToken", label: "Auth Token" },
  ],
  openai: [
    { key: "apiKey", label: "API Key" },
    { key: "model", label: "Modelo Realtime (ej. gpt-4o-realtime-preview)" },
  ],
  gohighlevel: [
    { key: "baseUrl", label: "Base URL" },
    { key: "accessToken", label: "Access Token" },
    { key: "locationId", label: "Location ID" },
  ],
};

const PROVIDER_LABELS: Record<Provider, string> = {
  twilio: "Twilio",
  openai: "OpenAI",
  gohighlevel: "GoHighLevel",
};

export default function IntegrationsPage() {
  const [configured, setConfigured] = useState<Provider[]>([]);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [forms, setForms] = useState<Record<Provider, Record<string, string>>>({
    twilio: {},
    openai: {},
    gohighlevel: {},
  });

  async function load() {
    const { configured } = await api.get<{ configured: Provider[] }>("/integrations");
    setConfigured(configured);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSave(provider: Provider) {
    try {
      await api.put(`/integrations/${provider}`, forms[provider]);
      setMessages((m) => ({ ...m, [provider]: "Credenciales guardadas y cifradas correctamente." }));
      load();
    } catch (err) {
      setMessages((m) => ({
        ...m,
        [provider]: err instanceof ApiError ? err.message : "Error al guardar las credenciales",
      }));
    }
  }

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">Integraciones</h1>
      <p className="mb-6 text-sm text-slate-500">
        Las credenciales se cifran en la base de datos y nunca se muestran de vuelta una vez guardadas.
      </p>

      <div className="space-y-6">
        {(Object.keys(PROVIDER_FIELDS) as Provider[]).map((provider) => (
          <div key={provider} className="card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">{PROVIDER_LABELS[provider]}</h2>
              <span
                className={`badge ${
                  configured.includes(provider) ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                }`}
              >
                {configured.includes(provider) ? "Configurado" : "Sin configurar"}
              </span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {PROVIDER_FIELDS[provider].map((field) => (
                <div key={field.key}>
                  <label className="label" htmlFor={`${provider}-${field.key}`}>{field.label}</label>
                  <input
                    id={`${provider}-${field.key}`}
                    type="password"
                    className="input"
                    value={forms[provider][field.key] ?? ""}
                    onChange={(e) =>
                      setForms((f) => ({ ...f, [provider]: { ...f[provider], [field.key]: e.target.value } }))
                    }
                  />
                </div>
              ))}
            </div>
            {messages[provider] && <p className="mt-2 text-sm text-slate-600">{messages[provider]}</p>}
            <button className="btn-primary mt-3" onClick={() => handleSave(provider)}>
              Guardar
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
