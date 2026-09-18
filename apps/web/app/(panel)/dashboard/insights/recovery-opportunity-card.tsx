import ProUpgradePrompt from "@/components/panel/pro-upgrade-prompt";
import type { InsightsMetricsView } from "./types";

/**
 * "Recuperación automática" en Insights — una OPORTUNIDAD, nunca un
 * resultado.
 *
 * La distinción importa y es la razón de la mitad del copy de acá: el resto
 * de Insights muestra cosas que YA pasaron (clientes que volvieron,
 * beneficios canjeados, reseñas nuevas). Esta card muestra algo que TODAVÍA
 * NO pasó — cuántos clientes podrían entrar en una acción de recuperación.
 * Mezclar las dos cosas convertiría Insights en un folleto: "mirá todo lo
 * que Flikker logró" cuando no logró nada de eso todavía.
 *
 * El número es real y ya calculado: `segmentCounts.INACTIVE`, la misma
 * clasificación que usa Clientes (`computeVisitFrequency` +
 * `segmentCustomer`). Se usa INACTIVE y no AT_RISK a propósito — INACTIVE es
 * un hecho ("hace tiempo que no viene"), AT_RISK es una predicción, y una
 * predicción no es base honesta para justificar un upgrade.
 *
 * No se renderiza si:
 *  - el negocio ya tiene Pro (no hay nada que vender), o
 *  - no hay ningún cliente inactivo (no hay oportunidad real que mostrar —
 *    antes que inventar una, no se muestra nada).
 */
export default function RecoveryOpportunityCard({
  metrics,
  isPro,
}: {
  metrics: InsightsMetricsView;
  isPro: boolean;
}) {
  const inactive = metrics.segmentCounts?.INACTIVE ?? 0;

  if (isPro || inactive <= 0) return null;

  return (
    <ProUpgradePrompt
      feature="reactivacion_automatica"
      variant="card"
      title="Recuperación automática"
      description="Flikker detecta clientes que dejaron de venir y puede contactarlos por vos, con un beneficio para darles una razón para volver."
      evidence={
        inactive === 1
          ? "1 cliente hace tiempo que no vuelve."
          : `${inactive} clientes hace tiempo que no vuelven.`
      }
      benefits={[
        "Contactar automáticamente a los clientes que dejaron de venir.",
        "Entregarles un beneficio para darles un motivo concreto de volver.",
        "Medir cuántos volvieron después del contacto, no solo cuántos recibiste.",
      ]}
      cta="Activar Pro"
    />
  );
}
