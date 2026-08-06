"use client";

import { useEffect, useState } from "react";
import { Lightbulb, Loader2, TrendingUp } from "lucide-react";
import { useIsCheckinV2 } from "../../experience-context";

// ─── Types (match /checkin-metrics/overview) ────────────────────────────────

interface RetentionKpis {
  clientesNuevos: number;
  clientesRecurrentes: number;
  visitas: number;
  retornosDetectados: number;
  retornosPostCampana: number;
  retornosConfirmados: number;
  tasaRetorno: number | null;
  diasPromedioHastaVolver: number | null;
}

interface FunnelCounts {
  scanned: number;
  registered: number;
  messagesSent: number;
  messagesOpened: number;
  returns: number;
  benefitsRedeemed: number;
}

interface SourceRow {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  escaneos: number;
  registros: number;
  checkins: number;
  retornos: number;
  conversion: number | null;
}

interface Recommendation {
  id: string;
  title: string;
  detail: string;
}

interface Overview {
  retention: RetentionKpis;
  funnel: FunnelCounts;
  sources: SourceRow[];
  recommendations: Recommendation[];
}

const FUNNEL_STEPS: { key: keyof FunnelCounts; label: string }[] = [
  { key: "scanned", label: "Escaneos" },
  { key: "registered", label: "Registros" },
  { key: "messagesSent", label: "Mensajes enviados" },
  { key: "messagesOpened", label: "Mensajes abiertos" },
  { key: "returns", label: "Check-ins posteriores" },
  { key: "benefitsRedeemed", label: "Beneficios canjeados" },
];

function fmtPct(v: number | null): string {
  return v === null ? "—" : `${v}%`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function RetentionMetrics() {
  const isCheckinV2 = useIsCheckinV2();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // V2-only metrics: on a legacy business the endpoint answers 404, so don't
    // call it and don't render an error where the section simply doesn't apply.
    if (!isCheckinV2) return;
    let active = true;
    void (async () => {
      try {
        const res = await fetch("/api/proxy/checkin-metrics/overview");
        if (!res.ok) throw new Error("No pudimos cargar las métricas.");
        const json = (await res.json()) as Overview;
        if (active) setData(json);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Error al cargar.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [isCheckinV2]);

  // Legacy keeps only the retention sequence editor below — no V2 metrics.
  if (!isCheckinV2) return null;

  if (loading) {
    return (
      <div className="flex h-24 items-center justify-center text-sm text-[#8891A4]">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Cargando métricas…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C0392B]">
        {error ?? "No hay datos."}
      </div>
    );
  }

  const r = data.retention;
  const maxFunnel = Math.max(1, ...FUNNEL_STEPS.map((s) => data.funnel[s.key]));
  const noActivity = r.visitas === 0 && data.funnel.scanned === 0;

  if (noActivity) {
    return (
      <div className="rounded-[12px] border border-dashed border-[#E8EAF0] bg-white px-6 py-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#EEF0FB] text-[#5C6BC0]">
          <TrendingUp className="h-6 w-6" />
        </div>
        <p className="text-sm font-semibold text-[#1A202C]">
          Todavía no hay datos de retención
        </p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-[#8891A4]">
          En cuanto tus clientes empiecen a hacer check-in con el QR, vas a ver
          acá cuántos vuelven.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Clientes nuevos" value={r.clientesNuevos} />
        <Kpi label="Clientes recurrentes" value={r.clientesRecurrentes} />
        <Kpi label="Visitas" value={r.visitas} />
        <Kpi label="Tasa de retorno" value={fmtPct(r.tasaRetorno)} />
      </div>

      {/* Returns — three distinct, honestly-named figures */}
      <div className="rounded-[12px] border border-[#E8EAF0] bg-white p-5">
        <p className="text-sm font-semibold text-[#1A202C]">Retornos</p>
        <p className="mt-0.5 text-xs text-[#8891A4]">
          Distinguimos lo observado de lo atribuido para no afirmar de más.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ReturnStat
            value={r.retornosDetectados}
            label="Retornos detectados"
            hint="Clientes que volvieron y registraron otra visita."
          />
          <ReturnStat
            value={r.retornosPostCampana}
            label="Posteriores a una campaña"
            hint="Volvieron después de recibir un mensaje. Atribución temporal, no causa comprobada."
          />
          <ReturnStat
            value={r.retornosConfirmados}
            label="Confirmados por canje"
            hint="Volvieron y canjearon un beneficio. Evidencia fuerte."
          />
        </div>
        {r.diasPromedioHastaVolver !== null && (
          <p className="mt-4 text-xs text-[#8891A4]">
            Tiempo promedio hasta volver:{" "}
            <span className="font-semibold text-[#1A202C]">
              {r.diasPromedioHastaVolver} días
            </span>
          </p>
        )}
      </div>

      {/* Funnel */}
      <div className="rounded-[12px] border border-[#E8EAF0] bg-white p-5">
        <p className="text-sm font-semibold text-[#1A202C]">Embudo</p>
        <div className="mt-4 space-y-2">
          {FUNNEL_STEPS.map((step) => {
            const value = data.funnel[step.key];
            return (
              <div key={step.key} className="flex items-center gap-3">
                <span className="w-40 shrink-0 text-xs text-[#667085]">
                  {step.label}
                </span>
                <div className="h-6 flex-1 overflow-hidden rounded-[6px] bg-[#F5F6FA]">
                  <div
                    className="h-full rounded-[6px] bg-[#5C6BC0]"
                    style={{ width: `${(value / maxFunnel) * 100}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-sm font-semibold text-[#1A202C]">
                  {value}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Per-source */}
      {data.sources.length > 0 && (
        <div className="rounded-[12px] border border-[#E8EAF0] bg-white p-5">
          <p className="text-sm font-semibold text-[#1A202C]">
            Rendimiento por QR
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-[#98a2b3]">
                  <th className="pb-2 pr-3 font-semibold">Fuente</th>
                  <th className="pb-2 px-3 text-right font-semibold">Escaneos</th>
                  <th className="pb-2 px-3 text-right font-semibold">Registros</th>
                  <th className="pb-2 px-3 text-right font-semibold">Check-ins</th>
                  <th className="pb-2 px-3 text-right font-semibold">Retornos</th>
                  <th className="pb-2 pl-3 text-right font-semibold">Conv.</th>
                </tr>
              </thead>
              <tbody>
                {data.sources.map((s) => (
                  <tr key={s.id} className="border-t border-[#F0F1F5]">
                    <td className="py-2 pr-3 font-medium text-[#1A202C]">
                      {s.name}
                      {!s.isActive && (
                        <span className="ml-2 text-[11px] text-[#98a2b3]">
                          (inactiva)
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right text-[#475467]">
                      {s.escaneos}
                    </td>
                    <td className="py-2 px-3 text-right text-[#475467]">
                      {s.registros}
                    </td>
                    <td className="py-2 px-3 text-right text-[#475467]">
                      {s.checkins}
                    </td>
                    <td className="py-2 px-3 text-right text-[#475467]">
                      {s.retornos}
                    </td>
                    <td className="py-2 pl-3 text-right font-semibold text-[#1A202C]">
                      {fmtPct(s.conversion)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recommendations */}
      {data.recommendations.length > 0 && (
        <div className="rounded-[12px] border border-[#FCEEDB] bg-[#FFFBF5] p-5">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-[#D9822B]" />
            <p className="text-sm font-semibold text-[#1A202C]">Sugerencias</p>
          </div>
          <ul className="mt-3 space-y-3">
            {data.recommendations.map((rec) => (
              <li key={rec.id}>
                <p className="text-sm font-semibold text-[#1A202C]">
                  {rec.title}
                </p>
                <p className="text-sm text-[#667085]">{rec.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-[12px] border border-[#E8EAF0] bg-white p-4">
      <p className="text-2xl font-bold text-[#1A202C]">{value}</p>
      <p className="mt-0.5 text-xs font-medium text-[#8891A4]">{label}</p>
    </div>
  );
}

function ReturnStat({
  value,
  label,
  hint,
}: {
  value: number;
  label: string;
  hint: string;
}) {
  return (
    <div className="rounded-[10px] bg-[#F9FAFB] p-3">
      <p className="text-xl font-bold text-[#1A202C]">{value}</p>
      <p className="mt-0.5 text-xs font-semibold text-[#344054]">{label}</p>
      <p className="mt-1 text-[11px] leading-snug text-[#98a2b3]">{hint}</p>
    </div>
  );
}
