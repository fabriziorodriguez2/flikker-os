import { Sparkle } from "lucide-react";

/**
 * Espejo exacto de `BusinessImpactMetrics` (backend) — fechas llegan como
 * string ISO por JSON, nunca como `Date`. Fuente única: el backend nunca
 * inventa un número acá, y el frontend nunca recalcula ninguno.
 */
export interface BusinessImpactMetricsView {
  sinceFlikker: {
    windowStart: string;
    anchor: "onboarding" | "created";
    customersIdentified: number;
    customersReturned: number;
    customersReturnedAfterContact: number;
    benefitsRedeemed: number;
    newReviews: number;
  };
  hasEnoughRetentionEvidence: boolean;
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="font-display text-2xl font-extrabold text-[#6D4AFF]">
        {value}
      </div>
      <div className="mt-0.5 text-xs text-[#8891A4]">{label}</div>
    </div>
  );
}

/**
 * "Impacto de Flikker" — bloque muy visible, cerca del resumen IA, con
 * evidencia concreta desde la activación (`Business.onboardingCompletedAt`,
 * o `createdAt` si el negocio nunca completó onboarding — ver `anchor`).
 * Todos los números vienen del mismo read-model que los emails al dueño y
 * los hitos de WhatsApp (`BusinessImpactService`) — nunca se recalculan acá.
 *
 * Captación y reseñas SIEMPRE se muestran (son honestas incluso con poca
 * muestra). "Volvieron"/"volvieron después de contacto" solo se muestran
 * cuando `hasEnoughRetentionEvidence` es true — mostrar un 0 ahí se leería
 * como fracaso cuando en realidad es "todavía no hay muestra".
 */
export default function ImpactCard({
  impact,
}: {
  impact: BusinessImpactMetricsView;
}) {
  const { sinceFlikker } = impact;
  const stats: Array<{ value: number; label: string }> = [
    { value: sinceFlikker.customersIdentified, label: "Clientes identificados" },
  ];
  if (impact.hasEnoughRetentionEvidence) {
    stats.push({ value: sinceFlikker.customersReturned, label: "Volvieron" });
    if (sinceFlikker.customersReturnedAfterContact > 0) {
      stats.push({
        value: sinceFlikker.customersReturnedAfterContact,
        label: "Volvieron después de que Flikker los contactó",
      });
    }
  }
  if (sinceFlikker.benefitsRedeemed > 0) {
    stats.push({
      value: sinceFlikker.benefitsRedeemed,
      label: "Beneficios canjeados",
    });
  }
  stats.push({ value: sinceFlikker.newReviews, label: "Reseñas nuevas" });

  return (
    <div className="rounded-[16px] border border-[#E5E6EC] bg-white p-6 shadow-[0_3px_12px_rgba(42,40,67,0.06)]">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EEF0FB] text-[#5C6BC0]">
          <Sparkle className="h-4 w-4" aria-hidden="true" />
        </span>
        <h2 className="font-display text-lg font-bold text-[#1A202C]">
          Desde que activaste Flikker
        </h2>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
        {stats.map((stat) => (
          <Stat key={stat.label} value={stat.value} label={stat.label} />
        ))}
      </div>

      {!impact.hasEnoughRetentionEvidence && (
        <p className="mt-5 text-xs leading-relaxed text-[#8891A4]">
          Todavía hay poca muestra para medir retención a largo plazo.
          Mientras tanto, Flikker ya convirtió actividad real en{" "}
          <strong className="text-[#1A202C]">
            {sinceFlikker.customersIdentified} clientes identificados
          </strong>{" "}
          y generó{" "}
          <strong className="text-[#1A202C]">
            {sinceFlikker.newReviews} reseñas nuevas
          </strong>
          .
        </p>
      )}
    </div>
  );
}
