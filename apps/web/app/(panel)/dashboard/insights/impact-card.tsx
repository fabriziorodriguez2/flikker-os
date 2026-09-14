import type { LucideIcon } from "lucide-react";
import { CreditCard, Repeat2, Star, UsersRound } from "lucide-react";
import Card from "@/components/ui/card";
import type { BusinessImpactMetricsView, InsightsMetricsView } from "./types";
import { percentage } from "./types";

export type { BusinessImpactMetricsView } from "./types";

function KpiTile({
  icon: Icon,
  label,
  value,
  context,
  accent = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  context: string;
  accent?: boolean;
}) {
  return (
    <Card className={accent ? "border-[color:var(--panel-info-border)]" : ""}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-[color:var(--panel-text-muted)]">
          {label}
        </p>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--panel-radius-control)] bg-[color:var(--panel-accent-soft)] text-[color:var(--panel-accent)]">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-3 text-[30px] font-semibold leading-8 tabular-nums tracking-[-0.035em] text-[color:var(--panel-text)]">
        {value}
      </p>
      <p className="mt-2 text-xs leading-4 text-[color:var(--panel-text-muted)]">
        {context}
      </p>
    </Card>
  );
}

export default function ImpactCard({
  impact,
  metrics,
}: {
  impact: BusinessImpactMetricsView;
  metrics?: InsightsMetricsView;
}) {
  const totalCustomers = metrics?.totalCustomers ?? 0;
  const returningCustomers = metrics?.returningCustomers ?? 0;
  const recurrence = percentage(returningCustomers, totalCustomers);
  const cardsInProgress =
    metrics?.stampCard.cardsInProgress ?? impact.lifetime.cardsInProgress;
  const newReviews =
    metrics?.reviewStats.inPeriod ?? impact.sinceFlikker.newReviews;

  return (
    <section aria-label="Indicadores principales">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiTile
          icon={UsersRound}
          label="Clientes identificados"
          value={impact.sinceFlikker.customersIdentified}
          context="Desde que activaste Flikker"
          accent
        />
        <KpiTile
          icon={Repeat2}
          label="Recurrencia histórica"
          value={recurrence === null ? "—" : `${recurrence}%`}
          context={
            recurrence === null
              ? "Todavía sin muestra"
              : `${returningCustomers} de ${totalCustomers} clientes volvieron`
          }
        />
        <KpiTile
          icon={Star}
          label="Reseñas nuevas"
          value={newReviews}
          context={
            metrics ? `Últimos ${metrics.windowDays} días` : "Desde el inicio"
          }
        />
        <KpiTile
          icon={CreditCard}
          label="Tarjetas activas"
          value={cardsInProgress}
          context={
            metrics
              ? `${metrics.stampCard.customersParticipating} clientes participan`
              : "En curso ahora"
          }
        />
      </div>
    </section>
  );
}
