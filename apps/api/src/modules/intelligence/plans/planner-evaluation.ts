import { extractNumbers, isBackedBy } from '../agent/grounding';
import {
  estimatePlanCost,
  validateCommercialPlan,
  type AuthorizedIncentive,
  type CommercialPlan,
  type PlanCostEstimate,
  type PlanIssue,
} from './commercial-plan';
import {
  previewSegment,
  reachableCustomerIds,
  type BusinessSnapshot,
} from './business-snapshot';
import type { SegmentRule } from './segment-rules';

/**
 * Lo que hace el servidor con una propuesta del planificador. Pura: recibe la
 * propuesta del modelo y los hechos del negocio, y decide qué plan es
 * inválido, repetido, inviable, no elegido o simulado. El modelo elige; esto
 * verifica que lo elegido se pueda hacer sin romper ninguna regla.
 */

/** Por debajo de esto no hay experimento que medir (control incluido). */
export const MIN_PLAN_RECIPIENTS = 5;
/** Máximo de planes elegidos por corrida. */
export const MAX_SELECTED_PLANS = 3;

export interface SubmittedPlan extends Omit<CommercialPlan, 'segment'> {
  segment: Omit<CommercialPlan['segment'], 'rule'> & {
    /** La regla viaja como JSON en texto: el servidor la parsea y valida. */
    rule: string;
  };
  selected: boolean;
  rank: number | null;
  selectionReason: string | null;
}

export interface PlannerSubmission {
  observations: string[];
  hypotheses: { statement: string; metrics: string[] }[];
  decision: 'PROPOSE' | 'NO_ACTION';
  noActionReason: string | null;
  /** Lo que va a leer el dueño. */
  ownerSummary: string;
  nextSteps: string[];
  plans: SubmittedPlan[];
}

export interface PlannerBudget {
  /** Costo por mensaje; null = no cargado (el costo queda desconocido). */
  messageUnitCost: number | null;
  /** Lo que queda del mes; null = sin tope configurado. */
  messagingRemaining: number | null;
  incentiveRemaining: number | null;
  /** Clientes nuevos que todavía se pueden contactar esta semana; null = sin tope. */
  weeklyRecipientsRemaining: number | null;
}

export interface EvaluationContext {
  snapshot: BusinessSnapshot;
  incentives: ReadonlyMap<string, AuthorizedIncentive>;
  budget: PlannerBudget;
  /** Huellas de planes recientes que no se repiten. */
  recentFingerprints: ReadonlySet<string>;
  now: Date;
  today: string;
  /** Números que vio el modelo en las vistas previas de esta corrida. */
  previewNumbers: number[];
}

export type EvaluatedStatus =
  | 'INVALID'
  | 'DUPLICATE'
  | 'INFEASIBLE'
  | 'NOT_SELECTED'
  | 'SIMULATED';

export interface EvaluatedPlan {
  index: number;
  submitted: SubmittedPlan;
  status: EvaluatedStatus;
  issues: PlanIssue[];
  rank: number | null;
  fingerprint: string | null;
  matched: number | null;
  reachable: number | null;
  /** Destinatarios asignados (solo elegidos y simulados). Nunca sale del servidor. */
  recipientIds: string[];
  cost: PlanCostEstimate | null;
  costKnown: boolean;
}

export interface SubmissionEvaluation {
  plans: EvaluatedPlan[];
  /** Problemas en la propuesta en sí (no en un plan). */
  issues: PlanIssue[];
  /** Problemas que el modelo puede corregir en otra vuelta. */
  repairable: boolean;
  /** Números del resumen para el dueño que no salen de ningún dato. */
  ungroundedSummaryNumbers: number[];
  /** El resumen para el dueño usa claves técnicas de métricas. */
  summaryHasJargon: boolean;
}

/** Claves de métricas ("visits.last_28d"): el dueño no las entiende. */
const METRIC_KEY = /\b(?:customers|visits|redemptions)\.[a-z0-9_.]+/i;

function issue(path: string, code: string, message: string): PlanIssue {
  return { path, code, message };
}

/** Todos los números que un texto del planificador puede citar. */
export function groundedNumbers(
  ctx: EvaluationContext,
  plans: SubmittedPlan[],
): number[] {
  const numbers = [...Object.values(ctx.snapshot.facts), ...ctx.previewNumbers];
  for (const inc of ctx.incentives.values()) {
    for (const v of [
      inc.unitCost,
      inc.percentageValue,
      inc.fixedValue,
      inc.expiresInDays,
    ]) {
      if (v !== null) numbers.push(v);
    }
  }
  for (const p of plans) {
    numbers.push(
      p.controlPercent,
      p.segment.maxRecipients,
      p.schedule?.sendWithinDays,
      p.successMetric?.windowDays,
      p.stopConditions?.maxOptOutPercent,
      p.stopConditions?.maxFailurePercent,
      ...(p.variants ?? []).map((v) => v.weightPercent),
      ...extractNumbers(p.segment.rule ?? ''),
    );
  }
  return numbers.filter(
    (n): n is number => typeof n === 'number' && Number.isFinite(n),
  );
}

/**
 * Números escritos en un texto que no salen de los datos. Los enteros chicos
 * (0 a 3) pasan: "una sola visita", "dos semanas", sin riesgo de inventar.
 */
export function ungroundedNumbers(text: string, grounded: number[]): number[] {
  return extractNumbers(text).filter(
    (n) =>
      !(Number.isInteger(n) && n >= 0 && n <= 3) &&
      !grounded.some((g) => isBackedBy(n, g)),
  );
}

function parseRule(raw: unknown): {
  rule: SegmentRule | null;
  error: string | null;
} {
  if (typeof raw !== 'string')
    return { rule: null, error: 'La regla debe ser JSON en texto.' };
  try {
    return { rule: JSON.parse(raw) as SegmentRule, error: null };
  } catch {
    return { rule: null, error: 'La regla no es JSON válido.' };
  }
}

export function evaluateSubmission(
  submission: PlannerSubmission,
  ctx: EvaluationContext,
): SubmissionEvaluation {
  const topIssues: PlanIssue[] = [];
  const plans = Array.isArray(submission.plans) ? submission.plans : [];
  const grounded = groundedNumbers(ctx, plans);

  if (submission.decision === 'NO_ACTION' && plans.some((p) => p.selected)) {
    topIssues.push(
      issue(
        'decision',
        'DECISION_CONFLICT',
        'Decidiste no actuar pero marcaste planes elegidos.',
      ),
    );
  }
  if (
    submission.decision === 'NO_ACTION' &&
    !submission.noActionReason?.trim()
  ) {
    topIssues.push(
      issue('noActionReason', 'TEXT', 'Explicá por qué no conviene actuar.'),
    );
  }
  if (plans.filter((p) => p.selected).length > MAX_SELECTED_PLANS) {
    topIssues.push(
      issue(
        'plans',
        'TOO_MANY_SELECTED',
        `Elegí como máximo ${MAX_SELECTED_PLANS} planes.`,
      ),
    );
  }

  const evaluated: EvaluatedPlan[] = plans.map((submitted, index) => {
    const base: EvaluatedPlan = {
      index,
      submitted,
      status: 'INVALID',
      issues: [],
      rank: submitted.selected ? submitted.rank : null,
      fingerprint: null,
      matched: null,
      reachable: null,
      recipientIds: [],
      cost: null,
      costKnown: ctx.budget.messageUnitCost !== null,
    };
    const { rule, error } = parseRule(submitted.segment?.rule);
    if (!rule) {
      base.issues.push(
        issue(`plans[${index}].segment.rule`, 'SEGMENT_RULE', error!),
      );
      return base;
    }
    const plan = { ...submitted, segment: { ...submitted.segment, rule } };
    const validation = validateCommercialPlan(plan, {
      incentives: ctx.incentives,
      facts: ctx.snapshot.facts,
      now: ctx.now,
      today: ctx.today,
    });
    if (!validation.valid) {
      base.issues.push(
        ...validation.issues.map((i) => ({
          ...i,
          path: `plans[${index}].${i.path}`,
        })),
      );
      return base;
    }

    // Los textos que va a leer el dueño no pueden traer números inventados.
    const texts = [
      submitted.hypothesis,
      submitted.rationale,
      submitted.selectionReason ?? '',
      ...submitted.evidence.map((e) => e.statement),
    ].join('\n');
    const loose = ungroundedNumbers(texts, grounded);
    if (loose.length) {
      base.issues.push(
        issue(
          `plans[${index}]`,
          'UNGROUNDED_NUMBER',
          `Números que no salen de los datos: ${loose.join(', ')}.`,
        ),
      );
      return base;
    }

    base.fingerprint = validation.fingerprint;
    const preview = previewSegment(ctx.snapshot, rule);
    base.matched = preview.matched;
    base.reachable = preview.reachable;
    if (ctx.recentFingerprints.has(validation.fingerprint)) {
      base.status = 'DUPLICATE';
      base.issues.push(
        issue(
          `plans[${index}]`,
          'DUPLICATE',
          'Es el mismo plan (mismo objetivo, segmento e incentivos) que uno reciente: primero hay que medirlo.',
        ),
      );
      return base;
    }
    base.status = 'NOT_SELECTED';
    return base;
  });

  // Elegidos, en el orden del planificador: alcance real, sin repetir
  // clientes entre planes, dentro del presupuesto y de los topes.
  const taken = new Set<string>();
  let messagingLeft = ctx.budget.messagingRemaining;
  let incentivesLeft = ctx.budget.incentiveRemaining;
  let weeklyLeft = ctx.budget.weeklyRecipientsRemaining;
  const selected = evaluated
    .filter((e) => e.submitted.selected && e.status === 'NOT_SELECTED')
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));

  for (const e of selected) {
    const path = `plans[${e.index}]`;
    const plan = e.submitted;
    const rule = JSON.parse(plan.segment.rule) as SegmentRule;
    const free = reachableCustomerIds(ctx.snapshot, rule)
      .filter((id) => !taken.has(id))
      .sort();
    let size = Math.min(free.length, plan.segment.maxRecipients);
    if (weeklyLeft !== null) size = Math.min(size, weeklyLeft);

    if ((e.reachable ?? 0) === 0) {
      e.status = 'INFEASIBLE';
      e.issues.push(
        issue(
          path,
          'NO_REACH',
          e.matched
            ? `Los ${e.matched} clientes del segmento no autorizaron WhatsApp.`
            : 'Ningún cliente entra en este segmento.',
        ),
      );
      continue;
    }
    if (size < MIN_PLAN_RECIPIENTS) {
      e.status = 'INFEASIBLE';
      e.issues.push(
        issue(
          path,
          free.length < (e.reachable ?? 0) ? 'OVERLAP' : 'TOO_SMALL',
          free.length < (e.reachable ?? 0)
            ? 'Casi todos sus clientes ya están en otro plan elegido.'
            : `Quedan ${size} clientes contactables: hacen falta al menos ${MIN_PLAN_RECIPIENTS} para medir algo.`,
        ),
      );
      continue;
    }

    const unit = ctx.budget.messageUnitCost ?? 0;
    let cost = estimatePlanCost(plan, size, ctx.incentives, unit);
    // Si no entra en lo que queda del presupuesto, se achica; si ni así, no va.
    while (
      size >= MIN_PLAN_RECIPIENTS &&
      ((messagingLeft !== null && cost.messaging > messagingLeft) ||
        (incentivesLeft !== null &&
          cost.incentivesMaxLiability > incentivesLeft))
    ) {
      size -= 1;
      cost = estimatePlanCost(plan, size, ctx.incentives, unit);
    }
    if (size < MIN_PLAN_RECIPIENTS) {
      e.status = 'INFEASIBLE';
      e.issues.push(
        issue(
          path,
          'BUDGET',
          'No entra en lo que queda del presupuesto del mes.',
        ),
      );
      continue;
    }

    e.status = 'SIMULATED';
    e.recipientIds = free.slice(0, size);
    e.cost = cost;
    e.recipientIds.forEach((id) => taken.add(id));
    if (messagingLeft !== null) messagingLeft -= cost.messaging;
    if (incentivesLeft !== null) incentivesLeft -= cost.incentivesMaxLiability;
    if (weeklyLeft !== null) weeklyLeft -= size;
  }

  const summaryNumbers = ungroundedNumbers(
    [
      submission.ownerSummary,
      ...(submission.nextSteps ?? []),
      ...(submission.observations ?? []),
    ].join('\n'),
    [
      ...grounded,
      ...evaluated.flatMap((e) => [
        e.matched ?? 0,
        e.reachable ?? 0,
        e.recipientIds.length,
        ...(e.cost
          ? [
              e.cost.treated,
              e.cost.control,
              e.cost.messaging,
              e.cost.incentivesMaxLiability,
              e.cost.total,
            ]
          : []),
      ]),
    ],
  );

  const summaryHasJargon = METRIC_KEY.test(submission.ownerSummary ?? '');
  const selectedInvalid = evaluated.some(
    (e) => e.submitted.selected && e.status === 'INVALID',
  );
  const nothingUsable =
    submission.decision === 'PROPOSE' &&
    !evaluated.some((e) => e.status === 'SIMULATED') &&
    evaluated.some((e) => e.status === 'INVALID');
  return {
    plans: evaluated,
    issues: topIssues,
    repairable:
      topIssues.length > 0 ||
      selectedInvalid ||
      nothingUsable ||
      summaryNumbers.length > 0 ||
      summaryHasJargon,
    ungroundedSummaryNumbers: summaryNumbers,
    summaryHasJargon,
  };
}

/** Devolución al modelo para que corrija en otra vuelta. */
export function feedbackForModel(evaluation: SubmissionEvaluation): string {
  const lines: string[] = [];
  for (const i of evaluation.issues) lines.push(`- ${i.path}: ${i.message}`);
  for (const e of evaluation.plans) {
    const label = `Plan ${e.index + 1} ("${e.submitted.title}")`;
    if (e.status === 'SIMULATED') {
      lines.push(`- ${label}: OK, ${e.recipientIds.length} destinatarios.`);
    } else if (e.status === 'NOT_SELECTED') {
      lines.push(
        `- ${label}: válido (${e.reachable} contactables), no elegido.`,
      );
    } else {
      lines.push(
        `- ${label}: ${e.status}. ${e.issues.map((i) => `${i.path}: ${i.message}`).join(' ')}`,
      );
    }
  }
  if (evaluation.ungroundedSummaryNumbers.length) {
    lines.push(
      `- ownerSummary/nextSteps/observations: números que no salen de los datos: ${evaluation.ungroundedSummaryNumbers.join(', ')}.`,
    );
  }
  if (evaluation.summaryHasJargon) {
    lines.push(
      '- ownerSummary: escribilo para el dueño, sin claves técnicas como "visits.last_28d".',
    );
  }
  return lines.join('\n');
}
