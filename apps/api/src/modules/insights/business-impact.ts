/**
 * Tipos + aritmética pura de "Impacto de Flikker" — el query real a la base
 * vive en `business-impact.service.ts`, esto solo define la forma y la
 * única regla de honestidad ("¿hay evidencia suficiente para hablar de
 * retención?"), para que sea testeable sin mocks. Mismo espíritu que
 * `reactivation-funnel.ts`/`experiment-metrics.ts`.
 *
 * Fuente única de verdad: Insights, los emails de ciclo de vida y los
 * hitos de WhatsApp consumen exactamente este resultado — nunca vuelven a
 * calcular "clientes que volvieron" o "beneficios canjeados" por su cuenta.
 */
import type { EvidenceState } from '../retention-v2/experiment-metrics';

export interface BusinessImpactWindowMetrics {
  /** Clientes dados de alta en la ventana — "identificados/capturados". */
  customersIdentified: number;
  /** Clientes con una visita en la ventana que YA tenían una visita anterior. */
  customersReturned: number;
  /**
   * Clientes que volvieron dentro de la ventana DESPUÉS de que Flikker los
   * contactó (Retención V2) — nunca frasear como "gracias a Flikker": la
   * atribución real es temporal ("volvió después de"), no causal.
   */
  customersReturnedAfterContact: number;
  benefitsRedeemed: number;
  newReviews: number;
}

export interface BusinessImpactLifetimeMetrics {
  customersIdentified: number;
  customersReturned: number;
  customersReturnedAfterContact: number;
  benefitsIssued: number;
  benefitsRedeemed: number;
  /** Clientes con una tarjeta ACTIVA ahora mismo — no es un delta de período, es una foto de hoy. */
  cardsInProgress: number;
  /** Mismo ancla que "sinceFlikker" (`Business.createdAt`) pero SIN ventana — todo el historial. */
  reviewsSinceFlikker: number;
}

export interface BusinessImpactMetrics {
  /** Ancla real de activación usada — `Business.onboardingCompletedAt`, o `createdAt` si nunca se completó onboarding. */
  sinceFlikker: BusinessImpactWindowMetrics & {
    windowStart: Date;
    anchor: 'onboarding' | 'created';
  };
  last30Days: BusinessImpactWindowMetrics;
  lifetime: BusinessImpactLifetimeMetrics;
  /** Mismo `evidenceState` que ya calcula `ReactivationFunnelService` — nunca un umbral nuevo. */
  reactivationEvidenceState: EvidenceState;
  /** `false` cuando todavía no hay muestra real para hablar de retención a largo plazo. */
  hasEnoughRetentionEvidence: boolean;
}

export function hasEnoughRetentionEvidence(state: EvidenceState): boolean {
  return state !== 'INSUFFICIENT_DATA';
}
