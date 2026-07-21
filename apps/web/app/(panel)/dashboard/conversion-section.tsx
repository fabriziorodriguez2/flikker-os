import { Suspense } from "react";
import { apiFetch } from "@/lib/api";
import { getEffectiveApiContext, getSession } from "@/lib/auth";
import SectionCard from "@/components/ui/section-card";
import ConversionRangeFilter from "./conversion-range-filter";

// ── types ─────────────────────────────────────────────────────────────────────

interface ConversionSummary {
  range: string;
  sentMessages: number;
  attributedReviews: number;
  conversionRate: number | null;
  insufficientData: boolean;
  clickedMessages: number;
  clickRate: number | null;
  positiveFeedback: number;
  positiveFeedbackRate: number | null;
  medianTimeToReviewHours: number | null;
  messagesNotSent: { queued: number; failed: number };
}

interface FunnelStep {
  key: string;
  label: string;
  count: number;
}

interface ConversionFunnel {
  steps: FunnelStep[];
  topDropOffStep: { step: string; ratio: number } | null;
}

type ValidRange = "last_30_days" | "last_90_days" | "all_time";

function normalizeRange(raw?: string): ValidRange {
  if (raw === "last_90_days" || raw === "all_time") return raw;
  return "last_30_days";
}

// ── stat chip ─────────────────────────────────────────────────────────────────

function StatChip({
  label,
  value,
  sub,
  muted,
}: {
  label: string;
  value: string;
  sub?: string;
  muted?: boolean;
}) {
  return (
    <div className="flex-1 rounded-[10px] border border-[#E8EAF0] bg-[#F9F9FB] px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8891A4]">
        {label}
      </p>
      <p
        className={`mt-1.5 text-2xl font-bold leading-none ${
          muted ? "text-[#8891A4]" : "text-[#1A202C]"
        }`}
      >
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs text-[#8891A4]">{sub}</p> : null}
    </div>
  );
}

// ── funnel bar ────────────────────────────────────────────────────────────────

function FunnelBar({ step, maxCount }: { step: FunnelStep; maxCount: number }) {
  const pct = maxCount > 0 ? Math.max(2, Math.round((step.count / maxCount) * 100)) : 0;
  const isNeg = step.key === "negative_feedback_filtered";
  const isReview = step.key === "review_detected";

  const barColor = isNeg
    ? "bg-[#FECACA]"
    : isReview
      ? "bg-[#5C6BC0]"
      : "bg-[#CBD5FF]";

  const labelColor = isNeg ? "text-[#C0392B]" : "text-[#4A5568]";

  return (
    <div className="flex items-center gap-3">
      <p className={`w-[160px] shrink-0 text-sm ${labelColor}`}>{step.label}</p>
      <div className="flex flex-1 items-center gap-2">
        <div className="relative h-5 flex-1 overflow-hidden rounded-full bg-[#F0F2FA]">
          {step.count > 0 && (
            <div
              className={`h-full rounded-full ${barColor}`}
              style={{ width: `${pct}%` }}
            />
          )}
        </div>
        <span className="w-14 text-right text-sm font-semibold tabular-nums text-[#1A202C]">
          {step.count.toLocaleString("es-UY")}
        </span>
      </div>
    </div>
  );
}

// ── drop-off label ────────────────────────────────────────────────────────────

const DROP_OFF_LABELS: Record<string, string> = {
  sent_to_clicked: "entre enviados y clics",
  clicked_to_positive: "entre clics y feedback positivo",
  positive_to_review: "entre feedback positivo y reseña detectada",
};

// ── main section ──────────────────────────────────────────────────────────────

async function ConversionContent({ range }: { range: ValidRange }) {
  const session = await getSession();
  if (!session?.activeBusinessId) return null;
  const { accessToken, businessId } = getEffectiveApiContext(session);
  if (!businessId) return null;

  let summary: ConversionSummary | null = null;
  let funnel: ConversionFunnel | null = null;

  try {
    [summary, funnel] = await Promise.all([
      apiFetch<ConversionSummary>(
        `/metrics/conversion?range=${range}&attribution_window_days=7`,
        accessToken,
        { businessId },
      ),
      apiFetch<ConversionFunnel>(
        `/metrics/conversion/funnel?attribution_window_days=7`,
        accessToken,
        { businessId },
      ),
    ]);
  } catch {
    return (
      <p className="text-sm text-[#8891A4]">No se pudieron cargar los datos de conversión.</p>
    );
  }

  if (!summary || !funnel) return null;

  const fmtRate = (r: number | null) =>
    r === null ? "—" : `${r.toLocaleString("es-UY", { maximumFractionDigits: 1 })}%`;

  const fmtHours = (h: number | null) => {
    if (h === null) return "—";
    if (h < 1) return `${Math.round(h * 60)} min`;
    return `${h.toLocaleString("es-UY", { maximumFractionDigits: 1 })} h`;
  };

  const maxCount = funnel.steps[0]?.count ?? 0;
  const dropLabel = summary.insufficientData
    ? null
    : funnel.topDropOffStep
      ? DROP_OFF_LABELS[funnel.topDropOffStep.step]
      : null;

  return (
    <div className="space-y-5">
      {/* KPI chips */}
      <div className="flex flex-wrap gap-3">
        <StatChip
          label="Tasa de conversión"
          value={fmtRate(summary.conversionRate)}
          sub={
            summary.insufficientData
              ? `Llevás ${summary.sentMessages} ${summary.sentMessages === 1 ? "mensaje" : "mensajes"}`
              : `${summary.attributedReviews} reseñas / ${summary.sentMessages} enviados`
          }
          muted={summary.insufficientData}
        />
        <StatChip
          label="Tasa de clics"
          value={fmtRate(summary.clickRate)}
          sub={`${summary.clickedMessages} clicks`}
          muted={summary.insufficientData}
        />
        <StatChip
          label="Tiempo mediano"
          value={fmtHours(summary.medianTimeToReviewHours)}
          sub="mensaje → reseña"
          muted={summary.medianTimeToReviewHours === null}
        />
      </div>

      {/* Insufficient data notice */}
      {summary.insufficientData && (
        <div className="rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Todavía estamos juntando datos. Cuando llegues a 30 mensajes enviados
          (sin contar los últimos 7 días) vas a ver acá tu tasa de conversión.
          ¡Seguí mandando! 💪
        </div>
      )}

      {/* Funnel */}
      {maxCount > 0 ? (
        <div className="space-y-2.5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
            Embudo de conversión (todo el tiempo)
          </p>
          <div className="space-y-2">
            {funnel.steps.map((step) => (
              <FunnelBar key={step.key} step={step} maxCount={maxCount} />
            ))}
          </div>

          {dropLabel && funnel.topDropOffStep && (
            <p className="mt-3 text-xs text-[#8891A4]">
              Mayor caída:{" "}
              <span className="font-semibold text-[#C0392B]">
                {dropLabel} ({Math.round(funnel.topDropOffStep.ratio * 100)}% de conversión)
              </span>
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-[#8891A4]">Aún no hay mensajes enviados para mostrar el embudo.</p>
      )}

      {/* Queued / failed note */}
      {(summary.messagesNotSent.queued > 0 || summary.messagesNotSent.failed > 0) && (
        <p className="text-xs text-[#8891A4]">
          No contabilizados:{" "}
          {summary.messagesNotSent.queued > 0 && (
            <span>{summary.messagesNotSent.queued} en cola</span>
          )}
          {summary.messagesNotSent.queued > 0 && summary.messagesNotSent.failed > 0 && ", "}
          {summary.messagesNotSent.failed > 0 && (
            <span>{summary.messagesNotSent.failed} fallidos</span>
          )}
        </p>
      )}
    </div>
  );
}

export default function ConversionSection({
  rawRange,
  after,
}: {
  rawRange?: string;
  after?: React.ReactNode;
}) {
  const range = normalizeRange(rawRange);

  return (
    <SectionCard
      title="Conversión a reseñas"
      description="Cuántos de tus mensajes terminaron en una reseña de Google ⭐"
      action={<ConversionRangeFilter range={range} />}
    >
      <Suspense
        fallback={
          <div className="flex items-center gap-2 text-sm text-[#8891A4]">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#CBD5FF] border-t-[#5C6BC0]" />
            Cargando métricas de conversión...
          </div>
        }
      >
        <ConversionContent range={range} />
      </Suspense>
      {after}
    </SectionCard>
  );
}
