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
  consentGiven: boolean;
}

interface BulkDeleteResult {
  deletedCount: number;
  blocked: Array<{ id: string; name: string }>;
  notFound: string[];
}

export default function ProspectsPage() {
  const [prospects, setProspects] = useState<Prospect[] | null>(null);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkMarkingConsent, setBulkMarkingConsent] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    const { prospects } = await api.get<{ prospects: Prospect[] }>("/prospects");
    setProspects(prospects);
    setSelectedIds(new Set());
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

  async function handleDelete(prospect: Prospect) {
    if (!window.confirm(`¿Eliminar a "${prospect.name}" definitivamente? Esta acción no se puede deshacer.`)) return;
    setDeleteError(null);
    try {
      await api.delete(`/prospects/${prospect.id}`);
      load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const confirmForce = window.confirm(
          `"${prospect.name}" ya tiene llamadas o citas registradas.\n\n¿Eliminarlo de todas formas, borrando TAMBIÉN todo su historial de llamadas? Esto no se puede deshacer.`,
        );
        if (!confirmForce) return;
        try {
          await api.delete(`/prospects/${prospect.id}?force=true`);
          load();
        } catch (forceErr) {
          setDeleteError(forceErr instanceof ApiError ? forceErr.message : "Error al eliminar el prospecto");
        }
      } else {
        setDeleteError(err instanceof ApiError ? err.message : "Error al eliminar el prospecto");
      }
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (!prospects) return;
    setSelectedIds((prev) => (prev.size === prospects.length ? new Set() : new Set(prospects.map((p) => p.id))));
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`¿Eliminar ${selectedIds.size} prospectos seleccionados? Esta acción no se puede deshacer.`)) {
      return;
    }
    setDeleteError(null);
    setBulkMessage(null);
    setBulkDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      const result = await api.post<BulkDeleteResult>("/prospects/bulk-delete", { ids });

      let finalDeleted = result.deletedCount;
      if (result.blocked.length > 0) {
        const names = result.blocked.map((b) => b.name).join(", ");
        const confirmForce = window.confirm(
          `${result.blocked.length} de los seleccionados ya tienen llamadas o citas registradas (${names}).\n\n` +
            `¿Eliminarlos de todas formas, borrando TAMBIÉN su historial de llamadas? Esto no se puede deshacer.`,
        );
        if (confirmForce) {
          const forced = await api.post<BulkDeleteResult>("/prospects/bulk-delete", {
            ids: result.blocked.map((b) => b.id),
            force: true,
          });
          finalDeleted += forced.deletedCount;
        }
      }

      setBulkMessage(`Se eliminaron ${finalDeleted} prospectos.`);
      load();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Error al eliminar los prospectos seleccionados");
    } finally {
      setBulkDeleting(false);
    }
  }

  async function handleBulkMarkConsent() {
    if (selectedIds.size === 0) return;
    setDeleteError(null);
    setBulkMessage(null);
    setBulkMarkingConsent(true);
    try {
      const ids = Array.from(selectedIds);
      const { updatedCount } = await api.post<{ updatedCount: number }>("/prospects/bulk-consent", {
        ids,
        consentGiven: true,
      });
      setBulkMessage(`Se marcó consentimiento en ${updatedCount} prospectos.`);
      load();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Error al marcar consentimiento en los prospectos seleccionados");
    } finally {
      setBulkMarkingConsent(false);
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
      {bulkMessage && <p className="mb-4 text-sm text-emerald-600">{bulkMessage}</p>}
      {deleteError && <p className="mb-4 text-sm text-red-600">{deleteError}</p>}

      {selectedIds.size > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-md bg-slate-100 px-4 py-2">
          <p className="text-sm text-slate-700">{selectedIds.size} seleccionados</p>
          <div className="flex gap-2">
            <button className="btn-secondary" disabled={bulkMarkingConsent} onClick={handleBulkMarkConsent}>
              {bulkMarkingConsent ? "Marcando..." : "Marcar consentimiento"}
            </button>
            <button className="btn-danger" disabled={bulkDeleting} onClick={handleBulkDelete}>
              {bulkDeleting ? "Eliminando..." : "Eliminar seleccionados"}
            </button>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={Boolean(prospects?.length) && selectedIds.size === prospects?.length}
                  onChange={toggleSelectAll}
                />
              </th>
              <th>Nombre</th>
              <th>Teléfono</th>
              <th>Empresa</th>
              <th>Estado</th>
              <th>Consentimiento</th>
              <th>Intentos</th>
              <th>Próximo intento</th>
              <th>Resultado final</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {prospects?.map((p) => (
              <tr key={p.id}>
                <td>
                  <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelected(p.id)} />
                </td>
                <td className="font-medium">{p.name}</td>
                <td>{p.phoneE164}</td>
                <td>{p.company}</td>
                <td>
                  <span className="badge bg-slate-100 text-slate-700">{p.status}</span>
                </td>
                <td>
                  {p.consentGiven ? (
                    <span className="badge bg-emerald-100 text-emerald-700">Sí</span>
                  ) : (
                    <span className="badge bg-amber-100 text-amber-700">No</span>
                  )}
                </td>
                <td>{p.attemptCount}</td>
                <td>{p.nextAttemptAt ? new Date(p.nextAttemptAt).toLocaleString() : "—"}</td>
                <td>{p.finalOutcome ?? "—"}</td>
                <td className="whitespace-nowrap">
                  <Link href={`/prospects/${p.id}`} className="text-brand-600 hover:underline">
                    Ver
                  </Link>
                  <button
                    className="ml-3 text-red-600 hover:underline"
                    onClick={() => handleDelete(p)}
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
            {prospects?.length === 0 && (
              <tr>
                <td colSpan={10} className="py-6 text-center text-slate-400">
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
