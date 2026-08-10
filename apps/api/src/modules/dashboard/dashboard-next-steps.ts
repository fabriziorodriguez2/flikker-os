/**
 * Dashboard principal — "Próximos pasos sugeridos". Función pura y
 * determinística: mismo input, mismo resultado, siempre — nunca IA, nunca
 * texto inventado. El orden del array de candidatos ES la prioridad;
 * `computeNextSteps` corta a los primeros 3 que aplican.
 */

export interface NextStepsInput {
  experienceVersion: 'LEGACY' | 'CHECKIN_V2';
  retentionEngineEnabled: boolean;
  retentionDryRunEnabled: boolean;
  hasRetentionExperiment: boolean;
  rewardGoalsEnabled: boolean;
  hasAnyBenefit: boolean;
  hasAuthorizedBenefit: boolean;
  hasActiveVisitSource: boolean;
  reviewsTotal: number;
  reviewsInPeriod: number;
}

export interface NextStep {
  id: string;
  title: string;
  description: string;
  ctaHref: string;
  ctaLabel: string;
}

const LOW_REVIEWS_TOTAL_THRESHOLD = 10;

export function computeNextSteps(input: NextStepsInput): NextStep[] {
  const isCheckinV2 = input.experienceVersion === 'CHECKIN_V2';
  const candidates: NextStep[] = [];

  // Prioridad 1 — Retención en Observación: es reversible y con ventana de
  // tiempo (cuanto antes se revise, más rápido se puede pasar a En vivo).
  if (
    isCheckinV2 &&
    input.retentionEngineEnabled &&
    input.retentionDryRunEnabled
  ) {
    candidates.push({
      id: 'retention-observing',
      title: 'Revisá los clientes detectados antes de pasar a En vivo',
      description:
        'Retención está en modo Observación: ya está decidiendo, pero todavía no manda nada real.',
      ctaHref: '/dashboard/retention-v2',
      ctaLabel: 'Ir a Retención',
    });
  }

  // Prioridad 2 — Reward Goals apagado: activarlo no requiere configurar
  // nada manualmente, es la ganancia más rápida disponible.
  if (isCheckinV2 && !input.rewardGoalsEnabled) {
    candidates.push({
      id: 'reward-goals-off',
      title: 'Activá recompensas por visitas',
      description:
        'Premiá automáticamente a los clientes que vuelven varias veces.',
      ctaHref: '/dashboard/retention-v2',
      ctaLabel: 'Activar',
    });
  }

  // Prioridad 3 — sin ningún beneficio creado, o creados pero ninguno
  // autorizado para que la automatización lo use.
  if (!input.hasAnyBenefit) {
    candidates.push({
      id: 'no-benefits',
      title: 'Creá tu primer beneficio',
      description:
        'Un incentivo simple (ej. un descuento) ayuda a que los clientes vuelvan.',
      ctaHref: '/dashboard/benefits',
      ctaLabel: 'Crear beneficio',
    });
  } else if (isCheckinV2 && !input.hasAuthorizedBenefit) {
    candidates.push({
      id: 'benefits-not-authorized',
      title: 'Autorizá un beneficio para Retención',
      description:
        'Tenés beneficios creados, pero ninguno habilitado para recuperación o recompensa.',
      ctaHref: '/dashboard/benefits',
      ctaLabel: 'Revisar beneficios',
    });
  }

  // Prioridad 4 — sin fuente QR/NFC activa, el check-in no puede funcionar.
  if (isCheckinV2 && !input.hasActiveVisitSource) {
    candidates.push({
      id: 'no-qr-source',
      title: 'Configurá tu QR principal',
      description:
        'Todavía no tenés una fuente QR/NFC activa para que tus clientes hagan check-in.',
      ctaHref: '/dashboard/qr',
      ctaLabel: 'Configurar QR',
    });
  }

  // Prioridad 5 — Retención encendida pero sin ningún experimento: está
  // decidiendo sin que nadie mida si realmente funciona.
  if (
    isCheckinV2 &&
    input.retentionEngineEnabled &&
    !input.hasRetentionExperiment
  ) {
    candidates.push({
      id: 'no-experiment',
      title: 'Empezá a medir tus recordatorios',
      description:
        'Creá un experimento simple para saber si tus mensajes realmente hacen volver a los clientes.',
      ctaHref: '/dashboard/retention-v2',
      ctaLabel: 'Crear experimento',
    });
  }

  // Prioridad 6 — pocas reseñas, la señal más "de fondo" (nunca urgente).
  if (
    input.reviewsInPeriod === 0 ||
    input.reviewsTotal < LOW_REVIEWS_TOTAL_THRESHOLD
  ) {
    candidates.push({
      id: 'low-reviews',
      title: 'Impulsá nuevas reseñas',
      description:
        'Pedile a tus clientes recientes que dejen una reseña en Google.',
      ctaHref: '/dashboard/campaigns',
      ctaLabel: 'Ver campañas',
    });
  }

  return candidates.slice(0, 3);
}
