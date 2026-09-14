import type { LucideIcon } from "lucide-react";
import {
  Clock3,
  Gift,
  Megaphone,
  MessageSquareText,
  Repeat2,
  Star,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import Card from "@/components/ui/card";
import HighlightedText from "./highlighted-text";
import type { InsightStatement } from "./types";

export type { InsightStatement } from "./types";

const META: Record<string, { title: string; icon: LucideIcon }> = {
  "new-vs-returning": { title: "Captación y recurrencia", icon: UsersRound },
  "stamp-card-overview": { title: "Uso del programa", icon: Gift },
  reviews: { title: "Reputación", icon: Star },
  churn: { title: "Retención", icon: Repeat2 },
  "stamp-card-impact": { title: "Impacto de la tarjeta", icon: TrendingUp },
  "promotion-performance": { title: "Promociones", icon: Megaphone },
  "reactivation-funnel": { title: "Reactivación", icon: Repeat2 },
  "reactivation-by-arm": { title: "Mensajes", icon: MessageSquareText },
  "busiest-timing": { title: "Momentos de mayor actividad", icon: Clock3 },
  "visit-frequency": { title: "Frecuencia de visita", icon: TrendingUp },
  feedback: { title: "Experiencia del cliente", icon: MessageSquareText },
};

const TONE: Record<InsightStatement["kind"], string> = {
  positive:
    "bg-[color:var(--panel-success-bg)] text-[color:var(--panel-success-text)]",
  warning:
    "bg-[color:var(--panel-warning-bg)] text-[color:var(--panel-warning-text)]",
  neutral:
    "bg-[color:var(--panel-surface-muted)] text-[color:var(--panel-text-muted)]",
};

export default function InsightCards({
  insights,
}: {
  insights: InsightStatement[];
}) {
  return (
    <Card padding="none">
      <div className="border-b border-[color:var(--panel-border)] px-5 py-4 sm:px-6">
        <h2 className="text-base font-semibold text-[color:var(--panel-text)]">
          Lo más importante ahora
        </h2>
        <p className="mt-1 text-xs text-[color:var(--panel-text-muted)]">
          Señales priorizadas a partir de la actividad real.
        </p>
      </div>

      {insights.length === 0 ? (
        <p className="px-5 py-8 text-sm text-[color:var(--panel-text-muted)] sm:px-6">
          Los insights aparecerán cuando haya más actividad.
        </p>
      ) : (
        <ul className="divide-y divide-[color:var(--panel-border)]">
          {insights.slice(0, 4).map((insight) => {
            const meta = META[insight.id] ?? {
              title: "Señal del negocio",
              icon: TrendingUp,
            };
            const Icon = meta.icon;
            return (
              <li key={insight.id} className="flex gap-3.5 px-5 py-4 sm:px-6">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--panel-radius-control)] ${TONE[insight.kind]}`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-[color:var(--panel-text)]">
                      {meta.title}
                    </h3>
                    {!insight.hasEnoughData ? (
                      <span className="text-[10px] font-medium uppercase tracking-[0.07em] text-[color:var(--panel-text-muted)]">
                        Muestra inicial
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm leading-5 text-[color:var(--panel-text-secondary)]">
                    <HighlightedText text={insight.statement} />
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
