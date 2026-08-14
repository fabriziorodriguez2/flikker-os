"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, Gift, Loader2, QrCode, Search, Tag } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import CustomerModal from "./customer-modal";
import { RECURRENCE, relativeDay, type RecurrenceKey } from "./loyalty-ui";

/**
 * Clientes, vistos como fidelización.
 *
 * La pantalla responde siete preguntas concretas del dueño: quiénes son sus
 * clientes, quién vuelve, cuántos sellos tiene cada uno, quién está cerca de
 * una recompensa, quién tiene una esperando y cuándo vino por última vez.
 * Nada más — no es un CRM, así que no hay pipeline, ni notas, ni tags.
 *
 * Todo llega de una sola llamada (`/customers/loyalty`): pedir el progreso
 * cliente por cliente desde el browser serían N requests para pintar la lista.
 */

interface LoyaltyRow {
  id: string;
  name: string;
  phone: string;
  visitCount: number;
  lastVisitAt: string | null;
  card: {
    rewardName: string;
    progressVisits: number;
    targetAdditionalVisits: number;
    remainingVisits: number;
  } | null;
  rewardAvailable: { rewardName: string } | null;
  benefitAvailable: boolean;
  recurrence: RecurrenceKey | null;
}

interface LoyaltyResponse {
  data: LoyaltyRow[];
  total: number;
  kpis: {
    windowDays: number;
    activos: number;
    volvieron: number;
    conRecompensa: number;
    nuevos: number;
  };
}

const FILTERS = [
  { key: "todos", label: "Todos" },
  { key: "nuevos", label: "Nuevos" },
  { key: "volvieron", label: "Volvieron" },
  { key: "cerca", label: "Cerca de completar" },
  { key: "recompensa", label: "Recompensa disponible" },
  { key: "ausentes", label: "Hace tiempo que no vienen" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

/**
 * `?customer=` es opcional y deliberadamente simple: sin intercepting
 * routes (de más para lo que hace falta acá) — solo un query param que se
 * lee al montar para reabrir el modal en un refresh o un link compartido, y
 * se sincroniza con `router.replace` (sin agregar entradas al historial por
 * cada clic) mientras el modal está abierto.
 */
export default function CustomersLoyaltyClient() {
  return (
    <Suspense fallback={null}>
      <CustomersLoyaltyContent />
    </Suspense>
  );
}

function CustomersLoyaltyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState<FilterKey>("todos");
  const [search, setSearch] = useState("");
  const [response, setResponse] = useState<LoyaltyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    searchParams.get("customer"),
  );

  function openCustomer(id: string) {
    setSelectedCustomerId(id);
    router.replace(`/dashboard/customers?customer=${id}`, { scroll: false });
  }

  function closeCustomer() {
    setSelectedCustomerId(null);
    router.replace("/dashboard/customers", { scroll: false });
  }

  const load = useCallback(async (nextFilter: FilterKey, term: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ filter: nextFilter, limit: "100" });
      if (term.trim()) params.set("search", term.trim());
      const res = await fetch(`/api/proxy/customers/loyalty?${params}`);
      if (!res.ok) throw new Error("No pudimos cargar tus clientes.");
      setResponse((await res.json()) as LoyaltyResponse);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No pudimos cargar tus clientes.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // La búsqueda se debouncea; el filtro se aplica al instante.
  useEffect(() => {
    const timer = setTimeout(() => void load(filter, search), search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [filter, search, load]);

  const kpis = response?.kpis;
  const rows = response?.data ?? [];
  // "Sin clientes" de verdad es distinto de "el filtro no devolvió nada".
  const businessHasNoCustomers =
    !loading &&
    !error &&
    rows.length === 0 &&
    filter === "todos" &&
    search.trim() === "" &&
    (kpis?.nuevos ?? 0) === 0;

  return (
    <div className="space-y-7">
      <PageHeader
        title="Clientes"
        subtitle="Conocé quién vuelve a tu negocio y cómo avanza en tu programa."
      />

      {/* ── KPIs ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Clientes activos"
          hint={`Vinieron en los últimos ${kpis?.windowDays ?? 30} días`}
          value={kpis?.activos}
        />
        <Kpi
          label="Volvieron"
          hint="Vinieron dos veces o más"
          value={kpis?.volvieron}
        />
        <Kpi
          label="Con recompensa disponible"
          hint="Ya la ganaron y falta entregarla"
          value={kpis?.conRecompensa}
        />
        <Kpi
          label="Nuevos"
          hint={`Se sumaron en los últimos ${kpis?.windowDays ?? 30} días`}
          value={kpis?.nuevos}
        />
      </div>

      {/* ── Filtros + búsqueda ────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {FILTERS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setFilter(option.key)}
              className={`shrink-0 rounded-full border px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                filter === option.key
                  ? "border-[#5C6BC0] bg-[#EEF0FB] text-[#4A56A6]"
                  : "border-[#E3E5F0] bg-white text-[#7F879C] hover:border-[#5C6BC0]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="relative lg:w-72 lg:shrink-0">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#B0B8C9]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o teléfono"
            aria-label="Buscar clientes"
            className="h-11 w-full rounded-[11px] border border-[#E3E5F0] bg-white pl-10 pr-4 text-sm text-[#202333] outline-none placeholder:text-[#B0B8C9] focus:border-[#5C6BC0]"
          />
        </div>
      </div>

      {/* ── Lista ─────────────────────────────────────────────────────── */}
      {error ? (
        <div className="space-y-3">
          <p className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C0392B]">
            {error}
          </p>
          <button
            type="button"
            onClick={() => void load(filter, search)}
            className="inline-flex h-10 items-center rounded-[10px] border border-[#E3E5F0] bg-white px-4 text-sm font-semibold text-[#202333] hover:border-[#5C6BC0]"
          >
            Reintentar
          </button>
        </div>
      ) : loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-[#5C6BC0]" />
        </div>
      ) : businessHasNoCustomers ? (
        <div className="rounded-[18px] border border-[#E8EAF0] bg-white px-6 py-14 text-center">
          <p className="font-display text-lg font-semibold text-[#202333]">
            Todavía no tenés clientes
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#7F879C]">
            Cuando alguien escanee tu QR por primera vez, va a aparecer acá.
          </p>
          <Link
            href="/dashboard/qr"
            className="mt-6 inline-flex h-11 items-center gap-2 rounded-[11px] bg-[#5C6BC0] px-5 text-sm font-semibold text-white hover:bg-[#4f5eb0]"
          >
            <QrCode className="h-4 w-4" />
            Ver mi QR
          </Link>
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-[16px] border border-dashed border-[#DDE1EC] bg-white px-5 py-10 text-center text-sm text-[#8891A4]">
          Ningún cliente coincide con esta búsqueda.
        </p>
      ) : (
        <ul className="divide-y divide-[#EFF1F7] overflow-hidden rounded-[16px] border border-[#E8EAF0] bg-white">
          {rows.map((row) => (
            <li key={row.id}>
              {/*
                Click abre el modal, no navega — ver `openCustomer`. Formato
                de la fila, en el orden pedido: nombre → visitas (+ sellos si
                el negocio usa tarjeta) → última visita. Nada de columnas de
                CRM (sin pipeline, notas ni tags).
              */}
              <button
                type="button"
                onClick={() => openCustomer(row.id)}
                className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-[#FAFBFE]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <span className="truncate text-[15px] font-semibold text-[#202333]">
                      {row.name}
                    </span>
                    {row.recurrence ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${RECURRENCE[row.recurrence].className}`}
                      >
                        {RECURRENCE[row.recurrence].label}
                      </span>
                    ) : null}
                    {row.rewardAvailable ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#EAF7EF] px-2 py-0.5 text-[11px] font-semibold text-[#147A5B]">
                        <Gift className="h-3 w-3" />
                        Recompensa disponible
                      </span>
                    ) : row.benefitAvailable ? (
                      // Un solo badge por fila — si ya tiene recompensa de
                      // tarjeta esperando, no se suma este (no llenar la fila).
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#EEF0FB] px-2 py-0.5 text-[11px] font-semibold text-[#4A56A6]">
                        <Tag className="h-3 w-3" />
                        Beneficio disponible
                      </span>
                    ) : null}
                  </div>

                  {/* "4 visitas · 3/5 sellos" — o solo "4 visitas" si el
                      negocio no usa tarjeta. Nunca se inventa un "0/0". */}
                  <p className="mt-1 text-sm text-[#5F6780]">
                    {visitLabel(row.visitCount)}
                    {row.card
                      ? ` · ${row.card.progressVisits}/${row.card.targetAdditionalVisits} sellos`
                      : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-[#8891A4]">
                    {lastVisitLabel(row.lastVisitAt)}
                  </p>
                </div>

                <ChevronRight className="h-4 w-4 shrink-0 text-[#C8D0E0]" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {selectedCustomerId ? (
        <CustomerModal
          customerId={selectedCustomerId}
          onClose={closeCustomer}
        />
      ) : null}
    </div>
  );
}

function visitLabel(count: number): string {
  return count === 1 ? "1 visita" : `${count} visitas`;
}

function lastVisitLabel(value: string | null): string {
  if (!value) return "Sin visitas todavía";
  const label = relativeDay(value);
  return `Última visita ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
}

function Kpi({
  label,
  hint,
  value,
}: {
  label: string;
  hint: string;
  value: number | undefined;
}) {
  return (
    <div className="rounded-[14px] border border-[#E8EAF0] bg-white px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8891A4]">
        {label}
      </p>
      <p className="mt-1.5 font-display text-2xl font-semibold tracking-[-0.02em] text-[#202333]">
        {value ?? "—"}
      </p>
      <p className="mt-1 text-[11px] leading-4 text-[#B0B8C9]">{hint}</p>
    </div>
  );
}
