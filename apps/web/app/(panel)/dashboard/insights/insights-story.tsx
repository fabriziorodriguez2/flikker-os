import {
  ArrowRight,
  Award,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  Lightbulb,
  Star,
  UsersRound,
} from "lucide-react";
import Card from "@/components/ui/card";
import type { InsightsMetricsView } from "./types";
import { percentage } from "./types";

function FlowStep({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof UsersRound;
  value: number;
  label: string;
}) {
  return (
    <div className="relative min-w-0 flex-1 text-center sm:text-left">
      <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-[var(--panel-radius-control)] bg-[color:var(--panel-accent-soft)] text-[color:var(--panel-accent)] sm:mx-0">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <p className="mt-3 text-2xl font-semibold tabular-nums tracking-tight text-[color:var(--panel-text)]">
        {value}
      </p>
      <p className="mt-1 text-xs leading-4 text-[color:var(--panel-text-muted)]">
        {label}
      </p>
    </div>
  );
}

export function FlikkerPerformance({
  metrics,
}: {
  metrics: InsightsMetricsView;
}) {
  return (
    <Card className="overflow-hidden" padding="none">
      <div className="border-b border-[color:var(--panel-border)] px-5 py-4 sm:px-6">
        <h2 className="text-base font-semibold text-[color:var(--panel-text)]">
          Así está funcionando Flikker
        </h2>
        <p className="mt-1 text-xs text-[color:var(--panel-text-muted)]">
          Del alta del cliente al uso de su recompensa.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-x-5 gap-y-7 px-5 py-5 sm:flex sm:items-start sm:px-6 sm:py-6">
        <FlowStep
          icon={UsersRound}
          value={metrics.newCustomersInWindow}
          label={`Nuevos en ${metrics.windowDays} días`}
        />
        <ArrowRight className="mt-12 hidden h-4 w-4 shrink-0 text-[color:var(--panel-border-strong)] sm:block" />
        <FlowStep
          icon={CreditCard}
          value={metrics.stampCard.customersParticipating}
          label="Participan del programa"
        />
        <ArrowRight className="mt-12 hidden h-4 w-4 shrink-0 text-[color:var(--panel-border-strong)] sm:block" />
        <FlowStep
          icon={Award}
          value={metrics.stampCard.unlockedTotal}
          label="Recompensas desbloqueadas"
        />
        <ArrowRight className="mt-12 hidden h-4 w-4 shrink-0 text-[color:var(--panel-border-strong)] sm:block" />
        <FlowStep
          icon={CheckCircle2}
          value={metrics.stampCard.redeemedTotal}
          label="Recompensas canjeadas"
        />
      </div>
    </Card>
  );
}

export function ReputationCard({ metrics }: { metrics: InsightsMetricsView }) {
  const { reviewStats } = metrics;
  const hasGoogle = reviewStats.googleRating !== null;

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-[color:var(--panel-text-muted)]">
            Reputación
          </p>
          <h2 className="mt-1 text-base font-semibold text-[color:var(--panel-text)]">
            Perfil de Google
          </h2>
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-[var(--panel-radius-control)] bg-[color:var(--panel-warning-bg)] text-[color:var(--panel-warning-text)]">
          <Star className="h-4 w-4 fill-current" aria-hidden="true" />
        </span>
      </div>

      {hasGoogle ? (
        <>
          <div className="mt-5 flex items-end gap-2">
            <strong className="text-[34px] font-semibold leading-9 tabular-nums tracking-tight text-[color:var(--panel-text)]">
              {reviewStats.googleRating?.toLocaleString("es-UY", {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })}
            </strong>
            <span className="mb-1 text-sm text-[color:var(--panel-text-muted)]">
              / 5
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[color:var(--panel-border)] pt-4">
            <div>
              <p className="text-lg font-semibold tabular-nums text-[color:var(--panel-text)]">
                {reviewStats.googleReviewsTotal ?? "—"}
              </p>
              <p className="text-xs text-[color:var(--panel-text-muted)]">
                Reseñas totales
              </p>
            </div>
            <div>
              <p className="text-lg font-semibold tabular-nums text-[color:var(--panel-success-text)]">
                +{reviewStats.inPeriod}
              </p>
              <p className="text-xs text-[color:var(--panel-text-muted)]">
                Últimos {metrics.windowDays} días
              </p>
            </div>
          </div>
        </>
      ) : (
        <p className="mt-5 text-sm leading-5 text-[color:var(--panel-text-muted)]">
          Conectá Google para ver rating y evolución de reseñas.
        </p>
      )}
    </Card>
  );
}

export function LoyaltyHealthCard({
  metrics,
}: {
  metrics: InsightsMetricsView;
}) {
  const directBenefitsIssued = metrics.benefitStats.reduce(
    (total, row) => total + row.issued,
    0,
  );
  const redemptionRate = percentage(
    metrics.stampCard.redeemedTotal,
    metrics.stampCard.unlockedTotal,
  );

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-[color:var(--panel-text-muted)]">
            Fidelización
          </p>
          <h2 className="mt-1 text-base font-semibold text-[color:var(--panel-text)]">
            Salud del programa
          </h2>
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-[var(--panel-radius-control)] bg-[color:var(--panel-accent-soft)] text-[color:var(--panel-accent)]">
          <Award className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4">
        <div>
          <p className="text-lg font-semibold tabular-nums text-[color:var(--panel-text)]">
            {metrics.stampCard.cardsInProgress}
          </p>
          <p className="text-xs text-[color:var(--panel-text-muted)]">
            Tarjetas en curso
          </p>
        </div>
        <div>
          <p className="text-lg font-semibold tabular-nums text-[color:var(--panel-text)]">
            {directBenefitsIssued}
          </p>
          <p className="text-xs text-[color:var(--panel-text-muted)]">
            Beneficios emitidos
          </p>
        </div>
        <div>
          <p className="text-lg font-semibold tabular-nums text-[color:var(--panel-text)]">
            {metrics.stampCard.unlockedTotal}
          </p>
          <p className="text-xs text-[color:var(--panel-text-muted)]">
            Desbloqueos
          </p>
        </div>
        <div>
          <p className="text-lg font-semibold tabular-nums text-[color:var(--panel-text)]">
            {redemptionRate === null ? "—" : `${redemptionRate}%`}
          </p>
          <p className="text-xs text-[color:var(--panel-text-muted)]">
            Desbloqueos canjeados
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-2 border-t border-[color:var(--panel-border)] pt-3 text-[11px] text-[color:var(--panel-text-muted)] opacity-65">
        <CircleDollarSign className="h-3.5 w-3.5" aria-hidden="true" />
        ROI estimado disponible al conectar ventas
      </div>
    </Card>
  );
}

export function RecommendationCard({ text }: { text: string }) {
  return (
    <section className="rounded-[var(--panel-radius-card)] border border-[color:var(--panel-info-border)] bg-[color:var(--panel-info-bg)] p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--panel-radius-control)] bg-[color:var(--panel-surface)] text-[color:var(--panel-accent)]">
          <Lightbulb className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--panel-accent)]">
            Qué haría Flikker
          </p>
          <p className="mt-2 max-w-3xl text-[15px] font-medium leading-6 text-[color:var(--panel-text)]">
            {text}
          </p>
        </div>
      </div>
    </section>
  );
}

export function buildRecommendation(metrics: InsightsMetricsView): string {
  const recurrence = percentage(
    metrics.returningCustomers,
    metrics.totalCustomers,
  );
  const pendingRewards = Math.max(
    metrics.stampCard.unlockedTotal - metrics.stampCard.redeemedTotal,
    0,
  );

  if (metrics.totalCustomers === 0) {
    return "El próximo foco debería ser generar las primeras visitas con tu QR para empezar a construir una base de clientes.";
  }
  if (recurrence !== null && metrics.totalCustomers >= 5 && recurrence < 20) {
    return "La captación ya empezó, pero la recurrencia todavía es baja. Enfocate en convertir primeras visitas en una segunda visita.";
  }
  if (pendingRewards > 0) {
    return `Hay ${pendingRewards} ${pendingRewards === 1 ? "recompensa desbloqueada" : "recompensas desbloqueadas"} sin canjear. Recordales a esos clientes que todavía tienen valor disponible.`;
  }
  if (metrics.reviewStats.inPeriod === 0) {
    return "Ya hay actividad de clientes. El próximo paso es convertir esas visitas satisfechas en nuevas reseñas de Google.";
  }
  return "La base muestra actividad saludable. Mantené el foco en recurrencia y seguí acompañando cada visita con el programa.";
}
