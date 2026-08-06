"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Clock,
  Copy,
  Download,
  Loader2,
  Plus,
  QrCode,
  Trash2,
  X,
} from "lucide-react";
import { useCanMutate } from "../../role-context";
import { useIsCheckinV2 } from "../../experience-context";
import PageHeader from "@/components/ui/page-header";

// ─── Types ──────────────────────────────────────────────────────────────────

interface VisitSource {
  id: string;
  name: string;
  type: string;
  token: string;
  isDefault: boolean;
  isActive: boolean;
  scannedCount: number;
}

interface CheckinRow {
  id: string;
  occurredAt: string;
  isReturn: boolean;
  attributionType: string;
  verificationType: string;
  customer: { id: string; name: string; phone: string | null };
  sourceName: string | null;
  campaignName: string | null;
  benefitTitle: string | null;
}

interface TimelineEntry {
  at: string;
  label: string;
}

interface Timeline {
  customer: { id: string; name: string; phone: string | null };
  entries: TimelineEntry[];
}

const ATTRIBUTION_LABEL: Record<string, string> = {
  organic: "Orgánico",
  post_campaign_checkin: "Post-campaña",
  confirmed_redemption: "Canje confirmado",
  unknown: "Sin atribuir",
};

const SOURCE_TYPE_LABEL: Record<string, string> = {
  qr: "QR",
  nfc: "NFC",
  link: "Link",
  manual: "Manual",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("es-UY", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function CheckinsPage() {
  const canMutate = useCanMutate();
  const isCheckinV2 = useIsCheckinV2();
  const [sources, setSources] = useState<VisitSource[]>([]);
  const [checkins, setCheckins] = useState<CheckinRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterSource, setFilterSource] = useState("");
  const [onlyReturns, setOnlyReturns] = useState(false);
  const [timeline, setTimeline] = useState<Timeline | null>(null);

  const loadSources = useCallback(async () => {
    const res = await fetch("/api/proxy/visit-sources");
    if (!res.ok) throw new Error("No pudimos cargar las fuentes.");
    setSources((await res.json()) as VisitSource[]);
  }, []);

  const loadCheckins = useCallback(async () => {
    const params = new URLSearchParams();
    if (filterSource) params.set("sourceId", filterSource);
    if (onlyReturns) params.set("onlyReturns", "true");
    const res = await fetch(`/api/proxy/checkins?${params.toString()}`);
    if (!res.ok) throw new Error("No pudimos cargar los check-ins.");
    setCheckins((await res.json()) as CheckinRow[]);
  }, [filterSource, onlyReturns]);

  useEffect(() => {
    // Legacy businesses must not even call the V2 endpoints (the API answers
    // 404 anyway) — skipping avoids rendering a broken screen full of errors.
    if (!isCheckinV2) return;
    let active = true;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        await Promise.all([loadSources(), loadCheckins()]);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Error al cargar.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [isCheckinV2, loadSources, loadCheckins]);

  async function openTimeline(customerId: string) {
    setTimeline(null);
    const res = await fetch(`/api/proxy/checkins/timeline/${customerId}`);
    if (res.ok) setTimeline((await res.json()) as Timeline);
  }

  // Navigating here by hand on a legacy business shows a clear "not available"
  // state rather than a broken page. The menu entry is hidden too, but hiding
  // the menu is never the protection on its own.
  if (!isCheckinV2) {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <PageHeader
          title="Check-ins"
          subtitle="Esta función todavía no está disponible para tu negocio."
        />
        <div className="rounded-[12px] border border-[#E8EAF0] bg-white px-6 py-8 text-center">
          <p className="text-sm font-semibold text-[#1A202C]">
            Check-in no está activo en este negocio
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-[#8891A4]">
            Seguís usando la experiencia actual de Flikker. Si querés activar el
            check-in digital, escribinos.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Check-ins"
        subtitle="Cada QR es un punto de check-in. Gestioná las fuentes y descubrí quién entra y quién vuelve."
      />

      {error ? (
        <div className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C0392B]">
          {error}
        </div>
      ) : null}

      <SourcesSection
        sources={sources}
        canMutate={canMutate}
        onChanged={() => {
          void loadSources();
          void loadCheckins();
        }}
      />

      {/* Check-ins table */}
      <div className="rounded-[12px] border border-[#E8EAF0] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-[#1A202C]">
            Últimos check-ins
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filterSource}
              onChange={(e) => setFilterSource(e.target.value)}
              className="h-9 rounded-[8px] border border-[#E8EAF0] bg-white px-2 text-sm text-[#1A202C] outline-none focus:border-[#5C6BC0]"
            >
              <option value="">Todas las fuentes</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm text-[#475467]">
              <input
                type="checkbox"
                checked={onlyReturns}
                onChange={(e) => setOnlyReturns(e.target.checked)}
              />
              Solo retornos
            </label>
          </div>
        </div>

        {loading ? (
          <div className="flex h-24 items-center justify-center text-sm text-[#8891A4]">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Cargando…
          </div>
        ) : checkins.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#8891A4]">
            Todavía no hay check-ins con estos filtros.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-[#98a2b3]">
                  <th className="pb-2 pr-3 font-semibold">Cliente</th>
                  <th className="pb-2 px-3 font-semibold">Fecha</th>
                  <th className="pb-2 px-3 font-semibold">Fuente</th>
                  <th className="pb-2 px-3 font-semibold">Tipo</th>
                  <th className="pb-2 px-3 font-semibold">Atribución</th>
                  <th className="pb-2 pl-3 font-semibold">Beneficio</th>
                </tr>
              </thead>
              <tbody>
                {checkins.map((c) => (
                  <tr key={c.id} className="border-t border-[#F0F1F5]">
                    <td className="py-2 pr-3">
                      <button
                        type="button"
                        onClick={() => void openTimeline(c.customer.id)}
                        className="font-medium text-[#5C6BC0] hover:underline"
                      >
                        {c.customer.name}
                      </button>
                    </td>
                    <td className="py-2 px-3 text-[#475467]">
                      {fmtDate(c.occurredAt)}
                    </td>
                    <td className="py-2 px-3 text-[#475467]">
                      {c.sourceName ?? "—"}
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          c.isReturn
                            ? "bg-[#EEF0FB] text-[#5C6BC0]"
                            : "bg-[#F0FDF4] text-[#12805c]"
                        }`}
                      >
                        {c.isReturn ? "Retorno" : "Primera visita"}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-[#475467]">
                      {ATTRIBUTION_LABEL[c.attributionType] ?? c.attributionType}
                      {c.campaignName ? (
                        <span className="block text-[11px] text-[#98a2b3]">
                          {c.campaignName}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pl-3 text-[#475467]">
                      {c.benefitTitle ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {timeline ? (
        <TimelineModal timeline={timeline} onClose={() => setTimeline(null)} />
      ) : null}
    </div>
  );
}

// ─── Sources ────────────────────────────────────────────────────────────────

function SourcesSection({
  sources,
  canMutate,
  onChanged,
}: {
  sources: VisitSource[];
  canMutate: boolean;
  onChanged: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("qr");
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function checkinUrl(token: string): string {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/check-in/${token}`;
  }

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await fetch("/api/proxy/visit-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), type }),
      });
      setName("");
      setType("qr");
      setCreating(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(source: VisitSource) {
    await fetch(`/api/proxy/visit-sources/${source.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !source.isActive }),
    });
    onChanged();
  }

  async function remove(source: VisitSource) {
    if (!window.confirm(`¿Eliminar la fuente "${source.name}"?`)) return;
    const res = await fetch(`/api/proxy/visit-sources/${source.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      window.alert(data.message ?? "No se pudo eliminar.");
      return;
    }
    onChanged();
  }

  async function copyUrl(source: VisitSource) {
    try {
      await navigator.clipboard.writeText(checkinUrl(source.token));
      setCopiedId(source.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      /* clipboard unavailable — ignore */
    }
  }

  return (
    <div className="rounded-[12px] border border-[#E8EAF0] bg-white p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-[#1A202C]">Fuentes QR</p>
        {canMutate && !creating ? (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex h-9 items-center gap-2 rounded-[8px] bg-[#5C6BC0] px-3 text-sm font-semibold text-white hover:bg-[#4f5eb0]"
          >
            <Plus className="h-4 w-4" />
            Nueva fuente
          </button>
        ) : null}
      </div>

      {creating ? (
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre (ej. Mesa 4, Mostrador)"
            className="h-10 flex-1 rounded-[8px] border border-[#E8EAF0] px-3 text-sm outline-none focus:border-[#5C6BC0]"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="h-10 rounded-[8px] border border-[#E8EAF0] px-2 text-sm outline-none focus:border-[#5C6BC0]"
          >
            <option value="qr">QR</option>
            <option value="link">Link</option>
          </select>
          <button
            type="button"
            onClick={() => void create()}
            disabled={busy || !name.trim()}
            className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-[#5C6BC0] px-4 text-sm font-semibold text-white hover:bg-[#4f5eb0] disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Crear
          </button>
          <button
            type="button"
            onClick={() => setCreating(false)}
            className="inline-flex h-10 items-center rounded-[8px] border border-[#E8EAF0] px-3 text-sm font-semibold text-[#475467]"
          >
            Cancelar
          </button>
        </div>
      ) : null}

      <div className="mt-4 space-y-2">
        {sources.map((s) => (
          <div
            key={s.id}
            className="flex flex-wrap items-center gap-3 rounded-[10px] border border-[#F0F1F5] px-3 py-2.5"
          >
            <div className="min-w-[120px] flex-1">
              <p className="text-sm font-semibold text-[#1A202C]">
                {s.name}
                {s.isDefault ? (
                  <span className="ml-2 text-[11px] font-normal text-[#98a2b3]">
                    (por defecto)
                  </span>
                ) : null}
              </p>
              <p className="text-[11px] text-[#98a2b3]">
                {SOURCE_TYPE_LABEL[s.type] ?? s.type} · {s.scannedCount} escaneos
                {s.isActive ? "" : " · inactiva"}
              </p>
            </div>

            <button
              type="button"
              onClick={() => void copyUrl(s)}
              className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-[#E8EAF0] px-3 text-xs font-medium text-[#475467] hover:bg-[#F5F6FA]"
            >
              <Copy className="h-3.5 w-3.5" />
              {copiedId === s.id ? "Copiado" : "Copiar link"}
            </button>

            <a
              href={`/api/checkin/source/${s.id}/qr`}
              className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-[#E8EAF0] px-3 text-xs font-medium text-[#475467] hover:bg-[#F5F6FA]"
            >
              <Download className="h-3.5 w-3.5" />
              QR
            </a>

            {canMutate ? (
              <>
                <button
                  type="button"
                  onClick={() => void toggleActive(s)}
                  className="inline-flex h-9 items-center rounded-[8px] border border-[#E8EAF0] px-3 text-xs font-medium text-[#475467] hover:bg-[#F5F6FA]"
                >
                  {s.isActive ? "Desactivar" : "Activar"}
                </button>
                {!s.isDefault ? (
                  <button
                    type="button"
                    onClick={() => void remove(s)}
                    aria-label="Eliminar fuente"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#E8EAF0] text-[#8891A4] hover:text-[#C0392B]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
        ))}
        {sources.length === 0 ? (
          <p className="flex items-center gap-2 py-4 text-sm text-[#8891A4]">
            <QrCode className="h-4 w-4" /> Todavía no hay fuentes.
          </p>
        ) : null}
      </div>
    </div>
  );
}

// ─── Timeline modal ─────────────────────────────────────────────────────────

function TimelineModal({
  timeline,
  onClose,
}: {
  timeline: Timeline;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-[16px] bg-white p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#1A202C]">
              {timeline.customer.name}
            </h2>
            {timeline.customer.phone ? (
              <p className="text-xs text-[#8891A4]">{timeline.customer.phone}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-[#8891A4] hover:text-[#1A202C]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5">
          {timeline.entries.length === 0 ? (
            <p className="text-sm text-[#8891A4]">Sin actividad registrada.</p>
          ) : (
            <ol className="space-y-3">
              {timeline.entries.map((e, i) => (
                <li key={i} className="flex gap-3">
                  <div className="mt-1 flex flex-col items-center">
                    <span className="h-2 w-2 rounded-full bg-[#5C6BC0]" />
                    {i < timeline.entries.length - 1 ? (
                      <span className="mt-1 h-full w-px flex-1 bg-[#E8EAF0]" />
                    ) : null}
                  </div>
                  <div className="pb-1">
                    <p className="text-sm font-medium text-[#1A202C]">
                      {e.label}
                    </p>
                    <p className="flex items-center gap-1 text-[11px] text-[#98a2b3]">
                      <Clock className="h-3 w-3" />
                      {fmtDate(e.at)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
