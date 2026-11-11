/**
 * Medición de un plan ejecutado. Pura: recibe asignaciones, visitas, canjes,
 * bajas y mensajes ya leídos, y devuelve qué pasó, sin adornos.
 *
 * Tres lecturas distintas, que nunca se mezclan:
 * - Correlación: cuántos volvieron DESPUÉS del mensaje (puede ser casualidad).
 * - Atribución: cuántos volvieron POR el mensaje (entraron por su link o
 *   canjearon el beneficio que traía).
 * - Incrementalidad: contactados contra grupo de control. Es la única que
 *   dice si el plan cambió algo, y solo con muestras suficientes.
 */

const MS_PER_DAY = 86_400_000;
/** Por debajo de esto por grupo, lo que haya es señal, no evidencia. */
export const MIN_ARM_FOR_EVIDENCE = 30;
/** Mínimos para que una condición de corte dispare (no por un caso aislado). */
const MIN_OPT_OUTS_TO_STOP = 2;
const MIN_FAILURES_TO_STOP = 3;

export interface ResultAssignment {
  customerId: string;
  isControl: boolean;
  variantName: string;
  status: 'PENDING' | 'OBSERVING' | 'SENT' | 'SKIPPED';
  exposedAt: Date | null;
  messageId: string | null;
  benefitParticipationId: string | null;
}

export interface ResultInput {
  assignments: ResultAssignment[];
  visits: { customerId: string; occurredAt: Date; messageId: string | null }[];
  redemptions: { participationId: string; redeemedAt: Date }[];
  /** Clientes que se dieron de baja o pidieron no ser contactados, y cuándo. */
  optOuts: { customerId: string; at: Date }[];
  messages: { sent: number; failed: number };
  windowDays: number;
  measureUntil: Date;
  now: Date;
  stopConditions: { maxOptOutPercent: number; maxFailurePercent: number };
  costs: {
    messageUnitCost: number | null;
    /** Costo estimado por canje, por nombre de variante. */
    incentiveCostByVariant: Record<string, number>;
  };
}

export type Evidence =
  | 'NO_DATA'
  | 'SIGNAL_ONLY'
  | 'INCREMENTAL'
  | 'NO_DIFFERENCE';

export interface PlanResults {
  phase: 'SENDING' | 'MEASURING' | 'COMPLETED';
  treated: {
    assigned: number;
    contacted: number;
    returned: number;
    attributed: number;
    redeemed: number;
  };
  control: { assigned: number; observed: number; returned: number };
  byVariant: {
    name: string;
    contacted: number;
    returned: number;
    redeemed: number;
  }[];
  /** Tasa de vuelta en %, con un decimal. Null sin base. */
  treatedReturnRate: number | null;
  controlReturnRate: number | null;
  /** Diferencia en puntos porcentuales (contactados − control). */
  liftPoints: number | null;
  evidence: Evidence;
  /** Lo que se puede afirmar, en castellano y sin exagerar. */
  readout: string;
  optOuts: number;
  optOutPercent: number | null;
  failurePercent: number | null;
  cost: {
    messages: number | null;
    incentivesRedeemed: number;
    total: number | null;
  };
  stop: { triggered: boolean; reason: 'OPT_OUTS' | 'FAILURES' | null };
}

const pct = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;

/** Prueba z de dos proporciones (bilateral, 95 %). */
function significant(x1: number, n1: number, x2: number, n2: number): boolean {
  const p = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (se === 0) return false;
  return Math.abs(x1 / n1 - x2 / n2) / se >= 1.96;
}

export function measurePlan(input: ResultInput): PlanResults {
  const visitsBy = new Map<string, ResultInput['visits']>();
  for (const v of input.visits) {
    const list = visitsBy.get(v.customerId) ?? [];
    list.push(v);
    visitsBy.set(v.customerId, list);
  }
  const redeemedParticipations = new Set(
    input.redemptions.map((r) => r.participationId),
  );
  const windowMs = input.windowDays * MS_PER_DAY;

  const returnedWithin = (a: ResultAssignment) => {
    if (!a.exposedAt) return { returned: false, viaMessage: false };
    const from = a.exposedAt.getTime();
    const to = from + windowMs;
    const hits = (visitsBy.get(a.customerId) ?? []).filter(
      (v) => v.occurredAt.getTime() > from && v.occurredAt.getTime() <= to,
    );
    return {
      returned: hits.length > 0,
      viaMessage: hits.some((v) => a.messageId && v.messageId === a.messageId),
    };
  };

  const treated = {
    assigned: 0,
    contacted: 0,
    returned: 0,
    attributed: 0,
    redeemed: 0,
  };
  const control = { assigned: 0, observed: 0, returned: 0 };
  const variants = new Map<
    string,
    { contacted: number; returned: number; redeemed: number }
  >();
  let pending = 0;
  let incentivesRedeemed = 0;

  for (const a of input.assignments) {
    if (a.status === 'PENDING') pending += 1;
    if (a.isControl) {
      control.assigned += 1;
      if (a.status === 'OBSERVING' && a.exposedAt) {
        control.observed += 1;
        if (returnedWithin(a).returned) control.returned += 1;
      }
      continue;
    }
    treated.assigned += 1;
    if (a.status !== 'SENT' || !a.exposedAt) continue;
    treated.contacted += 1;
    const v = variants.get(a.variantName) ?? {
      contacted: 0,
      returned: 0,
      redeemed: 0,
    };
    v.contacted += 1;
    const { returned, viaMessage } = returnedWithin(a);
    const redeemed = Boolean(
      a.benefitParticipationId &&
      redeemedParticipations.has(a.benefitParticipationId),
    );
    if (returned) {
      treated.returned += 1;
      v.returned += 1;
    }
    if (redeemed) {
      treated.redeemed += 1;
      v.redeemed += 1;
      incentivesRedeemed +=
        input.costs.incentiveCostByVariant[a.variantName] ?? 0;
    }
    if (viaMessage || redeemed) treated.attributed += 1;
    variants.set(a.variantName, v);
  }

  const treatedRate = pct(treated.returned, treated.contacted);
  const controlRate = pct(control.returned, control.observed);
  const lift =
    treatedRate !== null && controlRate !== null
      ? Math.round((treatedRate - controlRate) * 10) / 10
      : null;

  let evidence: Evidence;
  if (treated.contacted === 0) evidence = 'NO_DATA';
  else if (
    treated.contacted < MIN_ARM_FOR_EVIDENCE ||
    control.observed < MIN_ARM_FOR_EVIDENCE
  ) {
    evidence = 'SIGNAL_ONLY';
  } else {
    evidence =
      lift !== null &&
      lift > 0 &&
      significant(
        treated.returned,
        treated.contacted,
        control.returned,
        control.observed,
      )
        ? 'INCREMENTAL'
        : 'NO_DIFFERENCE';
  }

  const phase: PlanResults['phase'] =
    input.now.getTime() >= input.measureUntil.getTime()
      ? 'COMPLETED'
      : pending > 0
        ? 'SENDING'
        : 'MEASURING';

  const optOutCustomers = new Set<string>();
  const exposedAt = new Map(
    input.assignments
      .filter((a) => !a.isControl && a.exposedAt)
      .map((a) => [a.customerId, a.exposedAt!.getTime()]),
  );
  for (const o of input.optOuts) {
    const at = exposedAt.get(o.customerId);
    if (at !== undefined && o.at.getTime() >= at)
      optOutCustomers.add(o.customerId);
  }
  const optOuts = optOutCustomers.size;
  const optOutPercent = pct(optOuts, treated.contacted);
  const attempts = input.messages.sent + input.messages.failed;
  const failurePercent = pct(input.messages.failed, attempts);
  const stopReason =
    optOuts >= MIN_OPT_OUTS_TO_STOP &&
    (optOutPercent ?? 0) >= input.stopConditions.maxOptOutPercent
      ? 'OPT_OUTS'
      : input.messages.failed >= MIN_FAILURES_TO_STOP &&
          (failurePercent ?? 0) >= input.stopConditions.maxFailurePercent
        ? 'FAILURES'
        : null;

  const messagesCost =
    input.costs.messageUnitCost === null
      ? null
      : Math.round(input.messages.sent * input.costs.messageUnitCost * 100) /
        100;
  const redeemedCost = Math.round(incentivesRedeemed * 100) / 100;

  return {
    phase,
    treated,
    control,
    byVariant: [...variants].map(([name, v]) => ({ name, ...v })),
    treatedReturnRate: treatedRate,
    controlReturnRate: controlRate,
    liftPoints: lift,
    evidence,
    readout: readoutFor(evidence, phase, treated, control, lift),
    optOuts,
    optOutPercent,
    failurePercent,
    cost: {
      messages: messagesCost,
      incentivesRedeemed: redeemedCost,
      total:
        messagesCost === null
          ? null
          : Math.round((messagesCost + redeemedCost) * 100) / 100,
    },
    stop: { triggered: stopReason !== null, reason: stopReason },
  };
}

function readoutFor(
  evidence: Evidence,
  phase: PlanResults['phase'],
  t: PlanResults['treated'],
  c: PlanResults['control'],
  lift: number | null,
): string {
  if (evidence === 'NO_DATA') {
    return 'Todavía no se le escribió a nadie: no hay nada que medir.';
  }
  const open = phase !== 'COMPLETED' ? ' La medición sigue abierta.' : '';
  const base = `Volvieron ${t.returned} de ${t.contacted} contactados${c.observed ? ` y ${c.returned} de ${c.observed} del grupo de control` : ''}. ${t.attributed} volvieron por el mensaje (entraron por su link o canjearon el beneficio).`;
  if (evidence === 'SIGNAL_ONLY') {
    return `${base} Con grupos tan chicos es una señal, no una prueba: no se puede afirmar que el mensaje los hizo volver.${open}`;
  }
  if (evidence === 'INCREMENTAL') {
    return `${base} La diferencia con el grupo de control (${lift} puntos) es estadísticamente clara: el plan sumó vueltas que no habrían pasado igual.${open}`;
  }
  return `${base} No hay una diferencia clara con el grupo de control: no hay evidencia de que el plan haya sumado vueltas.${open}`;
}
