"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Archive, RotateCcw, Trash2 } from "lucide-react";

/**
 * El archivo, con las dos únicas salidas que tiene: volver, o desaparecer.
 *
 * Hasta ahora archivar era una puerta de una sola dirección incluso para el
 * admin — `findAllBusinesses` excluye los archivados, así que una vez
 * adentro no había forma de verlos ni de sacarlos.
 *
 * Las dos acciones son deliberadamente asimétricas. "Restaurar" es un click:
 * es reversible, y volver a archivar cuesta otro click. "Eliminar
 * definitivamente" pide escribir el nombre exacto: no hay forma de
 * deshacerlo, así que la fricción es la característica, no un obstáculo.
 * Un botón rojo de un solo click para algo irreversible es un accidente
 * esperando a pasar.
 *
 * El backend vuelve a validar las dos cosas (que esté archivado, y el
 * nombre) — esta pantalla no es la que decide.
 */

interface ArchivedBusiness {
  id: string;
  name: string;
  slug: string;
  archivedAt: string | null;
  customerCount: number;
  visitCount: number;
  reviewCount: number;
  memberCount: number;
}

export default function ArchivedBusinesses() {
  const [rows, setRows] = useState<ArchivedBusiness[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ArchivedBusiness | null>(
    null,
  );
  const [confirmationName, setConfirmationName] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/proxy/platform/businesses/archived");
      if (!res.ok) throw new Error("No pudimos cargar el archivo.");
      setRows((await res.json()) as ArchivedBusiness[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    }
  }, []);

  useEffect(() => {
    if (open && rows === null) void load();
  }, [open, rows, load]);

  async function restore(business: ArchivedBusiness) {
    setBusyId(business.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/proxy/platform/businesses/${business.id}/restore`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error("No pudimos restaurar el negocio.");
      setNotice(`"${business.name}" volvió a estar activo.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setBusyId(null);
    }
  }

  async function hardDelete(business: ArchivedBusiness) {
    setBusyId(business.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/proxy/platform/businesses/${business.id}/hard-delete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmationName }),
        },
      );
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          data && typeof data === "object" && "message" in data
            ? String((data as { message: unknown }).message)
            : "No pudimos eliminar el negocio.";
        throw new Error(message);
      }
      const total =
        data && typeof data === "object" && "totalDeleted" in data
          ? Number((data as { totalDeleted: unknown }).totalDeleted)
          : 0;
      setNotice(
        `"${business.name}" se eliminó definitivamente (${total} filas).`,
      );
      setPendingDelete(null);
      setConfirmationName("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-xl border border-[#E8EAF0] bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-4 text-left"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F5F6FA] text-[#8891A4]">
          <Archive className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-[#1A202C]">
            Archivados
          </span>
          <span className="block text-xs text-[#8891A4]">
            {rows === null
              ? "Negocios fuera de operación"
              : `${rows.length} ${rows.length === 1 ? "negocio" : "negocios"} fuera de operación`}
          </span>
        </span>
        <span className="text-xs font-semibold text-[#5C6BC0]">
          {open ? "Ocultar" : "Ver"}
        </span>
      </button>

      {open ? (
        <div className="border-t border-[#E8EAF0] px-4 py-4">
          {error ? (
            <p className="mb-3 rounded-lg border border-[#C0392B]/20 bg-[#C0392B]/10 px-4 py-3 text-sm text-[#C0392B]">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className="mb-3 rounded-lg border border-[#DDE1F5] bg-[#F4F5FD] px-4 py-3 text-sm text-[#4A56A6]">
              {notice}
            </p>
          ) : null}

          {rows === null ? (
            <p className="text-sm text-[#8891A4]">Cargando…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-[#8891A4]">
              No hay negocios archivados.
            </p>
          ) : (
            <ul className="space-y-2">
              {rows.map((b) => (
                <li
                  key={b.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#E8EAF0] px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#1A202C]">
                      {b.name}
                    </p>
                    <p className="mt-0.5 text-xs text-[#8891A4]">
                      {b.slug}
                      {b.archivedAt
                        ? ` · archivado el ${b.archivedAt.slice(0, 10)}`
                        : ""}
                      {` · ${b.customerCount} clientes · ${b.visitCount} visitas · ${b.reviewCount} reseñas`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void restore(b)}
                      disabled={busyId === b.id}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#E8EAF0] bg-white px-3 text-xs font-semibold text-[#1A202C] hover:bg-[#F5F6FA] disabled:opacity-60"
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      Restaurar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPendingDelete(b);
                        setConfirmationName("");
                        setError(null);
                      }}
                      disabled={busyId === b.id}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#C0392B]/25 bg-white px-3 text-xs font-semibold text-[#C0392B] hover:bg-[#C0392B]/5 disabled:opacity-60"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Eliminar definitivamente
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {pendingDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0D1B2A]/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="hard-delete-title"
            className="w-full max-w-md rounded-xl border border-[#E8EAF0] bg-white p-6"
          >
            <div className="flex items-start gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#C0392B]/10 text-[#C0392B]">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2
                  id="hard-delete-title"
                  className="text-lg font-bold text-[#1A202C]"
                >
                  Eliminar definitivamente “{pendingDelete.name}”
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#8891A4]">
                  Esto eliminará permanentemente su configuración, visitas,
                  beneficios, campañas, progreso de clientes e historial
                  específico del negocio. No se puede deshacer.
                </p>
                <p className="mt-2 text-sm leading-6 text-[#8891A4]">
                  La identidad global de los clientes (su cuenta de Flikker y
                  su historial en otros negocios) no se elimina, y las cuentas
                  de usuario del equipo se conservan.
                </p>
              </div>
            </div>

            <label className="mt-5 block">
              <span className="text-xs font-semibold text-[#1A202C]">
                Para confirmar, escribí{" "}
                <span className="font-mono">{pendingDelete.name}</span>
              </span>
              <input
                value={confirmationName}
                onChange={(e) => setConfirmationName(e.target.value)}
                autoComplete="off"
                className="mt-1 w-full rounded-lg border border-[#E8EAF0] px-3 py-2 text-sm text-[#1A202C] outline-none focus:border-[#C0392B]"
              />
            </label>

            {error ? (
              <p className="mt-3 text-sm text-[#C0392B]">{error}</p>
            ) : null}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPendingDelete(null);
                  setConfirmationName("");
                }}
                disabled={busyId === pendingDelete.id}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-[#E8EAF0] bg-white px-4 text-sm font-semibold text-[#1A202C] hover:bg-[#F5F6FA] disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void hardDelete(pendingDelete)}
                // El botón NO se habilita hasta que el nombre coincide exacto.
                disabled={
                  busyId === pendingDelete.id ||
                  confirmationName.trim() !== pendingDelete.name.trim()
                }
                className="inline-flex h-10 items-center justify-center rounded-lg bg-[#C0392B] px-4 text-sm font-semibold text-white hover:bg-[#a93226] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {busyId === pendingDelete.id
                  ? "Eliminando…"
                  : "Eliminar definitivamente"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
