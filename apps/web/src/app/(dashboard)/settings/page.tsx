"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/apiClient";
import { useRequireAuth } from "@/lib/useAuth";

interface Organization {
  id: string;
  name: string;
  timezoneDefault: string;
  simulationMode: boolean;
  consentRequired: boolean;
}

interface TeamMember {
  id: string;
  email: string;
  role: "owner" | "admin" | "agent";
  isActive: boolean;
  createdAt: string;
}

export default function SettingsPage() {
  const { user } = useRequireAuth();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [users, setUsers] = useState<TeamMember[] | null>(null);
  const [orgMessage, setOrgMessage] = useState<string | null>(null);
  const [orgError, setOrgError] = useState<string | null>(null);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [newMember, setNewMember] = useState({ email: "", password: "", role: "agent" as const });

  const canManage = user?.role === "owner" || user?.role === "admin";

  async function load() {
    const { organization } = await api.get<{ organization: Organization }>("/organization");
    setOrganization(organization);
    const { users } = await api.get<{ users: TeamMember[] }>("/organization/users");
    setUsers(users);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSaveOrganization(event: React.FormEvent) {
    event.preventDefault();
    if (!organization) return;
    setOrgError(null);
    setOrgMessage(null);
    try {
      await api.patch("/organization", {
        name: organization.name,
        timezoneDefault: organization.timezoneDefault,
        simulationMode: organization.simulationMode,
        consentRequired: organization.consentRequired,
      });
      setOrgMessage("Configuración guardada.");
      load();
    } catch (err) {
      setOrgError(err instanceof ApiError ? err.message : "Error al guardar la configuración");
    }
  }

  async function handleAddMember(event: React.FormEvent) {
    event.preventDefault();
    setMemberError(null);
    try {
      await api.post("/organization/users", newMember);
      setNewMember({ email: "", password: "", role: "agent" });
      load();
    } catch (err) {
      setMemberError(err instanceof ApiError ? err.message : "Error al crear el usuario");
    }
  }

  async function toggleActive(member: TeamMember) {
    await api.patch(`/organization/users/${member.id}`, { isActive: !member.isActive });
    load();
  }

  if (!organization) return <p className="text-sm text-slate-500">Cargando...</p>;

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Configuraciones</h1>

      <div className="card">
        <h2 className="mb-3 font-semibold">Organización</h2>
        <form onSubmit={handleSaveOrganization} className="space-y-4">
          <div>
            <label className="label" htmlFor="org-name">Nombre</label>
            <input
              id="org-name"
              className="input"
              disabled={!canManage}
              value={organization.name}
              onChange={(e) => setOrganization({ ...organization, name: e.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="org-timezone">Zona horaria predeterminada</label>
            <input
              id="org-timezone"
              className="input"
              disabled={!canManage}
              value={organization.timezoneDefault}
              onChange={(e) => setOrganization({ ...organization, timezoneDefault: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              disabled={!canManage}
              checked={organization.simulationMode}
              onChange={(e) => setOrganization({ ...organization, simulationMode: e.target.checked })}
            />
            Modo simulación por defecto para campañas nuevas
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              disabled={!canManage}
              checked={organization.consentRequired}
              onChange={(e) => setOrganization({ ...organization, consentRequired: e.target.checked })}
            />
            Requerir consentimiento por defecto para campañas nuevas
          </label>
          {orgMessage && <p className="text-sm text-emerald-600">{orgMessage}</p>}
          {orgError && <p className="text-sm text-red-600">{orgError}</p>}
          {canManage && (
            <button type="submit" className="btn-primary">
              Guardar
            </button>
          )}
        </form>
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold">Equipo</h2>
        <table className="table-base mb-4">
          <thead>
            <tr>
              <th>Email</th>
              <th>Rol</th>
              <th>Activo</th>
              {canManage && <th></th>}
            </tr>
          </thead>
          <tbody>
            {users?.map((m) => (
              <tr key={m.id}>
                <td>{m.email}</td>
                <td>{m.role}</td>
                <td>{m.isActive ? "Sí" : "No"}</td>
                {canManage && (
                  <td>
                    <button className="btn-secondary" onClick={() => toggleActive(m)}>
                      {m.isActive ? "Desactivar" : "Activar"}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {canManage && (
          <form onSubmit={handleAddMember} className="flex flex-wrap items-end gap-3">
            <div>
              <label className="label" htmlFor="member-email">Email</label>
              <input
                id="member-email"
                type="email"
                className="input"
                required
                value={newMember.email}
                onChange={(e) => setNewMember((m) => ({ ...m, email: e.target.value }))}
              />
            </div>
            <div>
              <label className="label" htmlFor="member-password">Contraseña temporal</label>
              <input
                id="member-password"
                type="password"
                className="input"
                required
                minLength={12}
                value={newMember.password}
                onChange={(e) => setNewMember((m) => ({ ...m, password: e.target.value }))}
              />
            </div>
            <div>
              <label className="label" htmlFor="member-role">Rol</label>
              <select
                id="member-role"
                className="input"
                value={newMember.role}
                onChange={(e) => setNewMember((m) => ({ ...m, role: e.target.value as typeof m.role }))}
              >
                <option value="agent">Agente</option>
                <option value="admin">Administrador</option>
                <option value="owner">Propietario</option>
              </select>
            </div>
            <button type="submit" className="btn-primary">
              Agregar usuario
            </button>
          </form>
        )}
        {memberError && <p className="mt-2 text-sm text-red-600">{memberError}</p>}
      </div>
    </div>
  );
}
