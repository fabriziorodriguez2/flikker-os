import { createHash } from 'node:crypto';
import { validateGeneratedCopy } from '../../ai/copy-validator';
import {
  canonicalSegmentRule,
  validateSegmentRule,
  type SegmentRule,
} from './segment-rules';

/**
 * Plan comercial generado por IA. Es el contrato entre el planificador (que
 * piensa libremente qué hacer) y el motor de ejecución (que solo ejecuta lo
 * que este validador aprueba). Todo lo que el plan afirma o promete se
 * verifica acá, sin llamar al modelo:
 *
 * - la evidencia cita métricas que el servidor calculó, con su valor real;
 * - el segmento usa solo rasgos y operadores permitidos;
 * - los incentivos existen en el catálogo autorizado y tienen costo;
 * - los mensajes no prometen montos, porcentajes, vencimientos ni regalos que
 *   el incentivo elegido no tiene;
 * - siempre hay grupo de control, ventana de medición y condiciones de corte.
 *
 * Lo que este archivo NO decide: a quién se le puede escribir (consentimiento,
 * frecuencia) ni cuánto se puede gastar (presupuesto). Eso lo resuelve el
 * motor de políticas al ejecutar.
 */

export const PLAN_SCHEMA_VERSION = 1;

export const PLAN_OBJECTIVES = [
  'REACTIVATE_LAPSED',
  'SECOND_VISIT',
  'INCREASE_FREQUENCY',
  'RECOVER_DECLINING',
  'REDEEM_BENEFITS',
  'REWARD_PROGRESS',
  'OTHER',
] as const;
export type PlanObjective = (typeof PLAN_OBJECTIVES)[number];

export const SUCCESS_METRICS = ['RETURN_VISIT', 'REDEMPTION'] as const;
export type SuccessMetricKind = (typeof SUCCESS_METRICS)[number];

/** El único canal que Flikker tiene implementado para campañas. */
export const PLAN_CHANNELS = ['WHATSAPP'] as const;

/** Marcadores que el servidor reemplaza al enviar. Ningún otro. */
export const MESSAGE_PLACEHOLDERS = ['{nombre}'] as const;

export const PLAN_LIMITS = {
  titleMax: 80,
  hypothesisMax: 600,
  rationaleMax: 600,
  evidenceMin: 1,
  evidenceMax: 8,
  variantsMax: 3,
  messageMax: 600,
  controlPercentMin: 10,
  controlPercentMax: 50,
  startWithinDays: 14,
  sendWithinDaysMax: 7,
  windowDaysMin: 7,
  windowDaysMax: 60,
  // Cota de cordura, no un tope comercial: el alcance lo deciden la política y la IA.
  maxRecipientsMax: 5000,
  optOutPercentMin: 1,
  optOutPercentMax: 10,
  failurePercentMin: 5,
  failurePercentMax: 30,
} as const;

export interface PlanEvidence {
  /** Clave de una métrica que el servidor calculó (ver `facts`). */
  metric: string;
  /** El valor que el plan dice que tiene: debe coincidir con el real. */
  value: number;
  /** Cómo lo lee el planificador, en lenguaje del dueño. */
  statement: string;
}

export interface PlanVariant {
  key: string;
  /** Texto del mensaje. Puede usar {nombre}. */
  message: string;
  /** Id del catálogo autorizado, o null para un mensaje sin incentivo. */
  incentiveId: string | null;
  /** Porcentaje del grupo que recibe esta variante. */
  weightPercent: number;
}

export interface CommercialPlan {
  schemaVersion: number;
  title: string;
  objective: PlanObjective;
  hypothesis: string;
  evidence: PlanEvidence[];
  segment: {
    description: string;
    rule: SegmentRule;
    /** Tope de destinatarios de este plan (el motor puede achicarlo). */
    maxRecipients: number;
  };
  channel: (typeof PLAN_CHANNELS)[number];
  variants: PlanVariant[];
  /** Porcentaje que NO recibe nada, para medir si el plan sirvió. */
  controlPercent: number;
  schedule: {
    /** 'ASAP' o una fecha AAAA-MM-DD en hora del negocio. */
    startOn: string;
    /** En cuántos días tiene que haber salido todo. */
    sendWithinDays: number;
  };
  successMetric: { kind: SuccessMetricKind; windowDays: number };
  stopConditions: { maxOptOutPercent: number; maxFailurePercent: number };
  /** Por qué este plan y no otro (lo que el dueño va a leer). */
  rationale: string;
}

/** Incentivo del catálogo que el dueño autorizó para automatizaciones. */
export interface AuthorizedIncentive {
  id: string;
  label: string;
  /** Costo estimado por emisión; null = no se puede estimar (bloquea). */
  unitCost: number | null;
  percentageValue: number | null;
  fixedValue: number | null;
  expiresInDays: number | null;
  /** True solo si "gratis" es literalmente cierto (un regalo). */
  allowFreeWording: boolean;
  /**
   * Costo cero real y verificable (`isVerifiedZeroCost`): se puede usar sin
   * presupuesto de incentivos y no lo consume.
   */
  zeroCost?: boolean;
}

export interface PlanValidationContext {
  incentives: ReadonlyMap<string, AuthorizedIncentive>;
  /** Métricas verificables del negocio: clave → valor real. */
  facts: Readonly<Record<string, number>>;
  now: Date;
  /** Fecha de hoy en la zona del negocio (AAAA-MM-DD). */
  today: string;
}

export interface PlanIssue {
  path: string;
  code: string;
  message: string;
}

export type PlanValidation =
  | { valid: true; plan: CommercialPlan; fingerprint: string }
  | { valid: false; issues: PlanIssue[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
const isInt = (v: unknown): v is number => Number.isInteger(v);
const text = (v: unknown, max: number) =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= max;

/** Valor de la evidencia igual al real (tolera redondeo a 2 decimales). */
function matchesFact(claimed: number, actual: number): boolean {
  return Math.abs(claimed - actual) <= Math.max(0.01, Math.abs(actual) * 0.005);
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(
    (Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) /
      86_400_000,
  );
}

/**
 * Valida un plan tal como vino del modelo. Devuelve TODOS los problemas (no
 * solo el primero) para que el planificador pueda corregir en una vuelta.
 */
export function validateCommercialPlan(
  input: unknown,
  ctx: PlanValidationContext,
): PlanValidation {
  const issues: PlanIssue[] = [];
  const add = (path: string, code: string, message: string) =>
    issues.push({ path, code, message });

  if (!isRecord(input)) {
    return {
      valid: false,
      issues: [
        {
          path: '',
          code: 'NOT_AN_OBJECT',
          message: 'El plan no es un objeto.',
        },
      ],
    };
  }
  const p = input;
  const L = PLAN_LIMITS;

  if (p.schemaVersion !== PLAN_SCHEMA_VERSION) {
    add(
      'schemaVersion',
      'SCHEMA_VERSION',
      `Se esperaba ${PLAN_SCHEMA_VERSION}.`,
    );
  }
  if (!text(p.title, L.titleMax)) {
    add('title', 'TEXT', `Título obligatorio, hasta ${L.titleMax} caracteres.`);
  }
  if (!PLAN_OBJECTIVES.includes(p.objective as PlanObjective)) {
    add('objective', 'ENUM', `Objetivo válido: ${PLAN_OBJECTIVES.join(', ')}.`);
  }
  if (!text(p.hypothesis, L.hypothesisMax)) {
    add(
      'hypothesis',
      'TEXT',
      `Hipótesis obligatoria, hasta ${L.hypothesisMax} caracteres.`,
    );
  }
  if (!text(p.rationale, L.rationaleMax)) {
    add(
      'rationale',
      'TEXT',
      `Justificación obligatoria, hasta ${L.rationaleMax} caracteres.`,
    );
  }

  // ── Evidencia: cada número tiene que salir de los datos ─────────────────
  if (
    !Array.isArray(p.evidence) ||
    p.evidence.length < L.evidenceMin ||
    p.evidence.length > L.evidenceMax
  ) {
    add(
      'evidence',
      'EVIDENCE_COUNT',
      `Entre ${L.evidenceMin} y ${L.evidenceMax} evidencias.`,
    );
  } else {
    p.evidence.forEach((e: unknown, i) => {
      const path = `evidence[${i}]`;
      if (
        !isRecord(e) ||
        typeof e.metric !== 'string' ||
        typeof e.value !== 'number'
      ) {
        add(
          path,
          'EVIDENCE_SHAPE',
          'Cada evidencia necesita metric, value y statement.',
        );
        return;
      }
      if (!text(e.statement, 300)) {
        add(path, 'TEXT', 'statement obligatorio, hasta 300 caracteres.');
      }
      const actual = ctx.facts[e.metric];
      if (actual === undefined) {
        add(
          path,
          'UNKNOWN_METRIC',
          `La métrica "${e.metric}" no existe en los datos.`,
        );
      } else if (!matchesFact(e.value, actual)) {
        add(
          path,
          'EVIDENCE_MISMATCH',
          `"${e.metric}" vale ${actual}, no ${e.value}.`,
        );
      }
    });
  }

  // ── Segmento ────────────────────────────────────────────────────────────
  if (!isRecord(p.segment)) {
    add('segment', 'SHAPE', 'Falta el segmento.');
  } else {
    if (!text(p.segment.description, 300)) {
      add(
        'segment.description',
        'TEXT',
        'Descripción obligatoria, hasta 300 caracteres.',
      );
    }
    for (const issue of validateSegmentRule(p.segment.rule)) {
      add(issue.path, 'SEGMENT_RULE', issue.message);
    }
    const max = p.segment.maxRecipients;
    if (!isInt(max) || max < 1 || max > L.maxRecipientsMax) {
      add('segment.maxRecipients', 'RANGE', `Entre 1 y ${L.maxRecipientsMax}.`);
    }
  }

  if (!PLAN_CHANNELS.includes(p.channel as (typeof PLAN_CHANNELS)[number])) {
    add(
      'channel',
      'CHANNEL_UNAVAILABLE',
      `Canal no disponible. Flikker hoy solo envía por: ${PLAN_CHANNELS.join(', ')}.`,
    );
  }

  // ── Variantes, incentivos y mensajes ────────────────────────────────────
  const control = p.controlPercent;
  if (
    !isInt(control) ||
    control < L.controlPercentMin ||
    control > L.controlPercentMax
  ) {
    add(
      'controlPercent',
      'CONTROL_REQUIRED',
      `Grupo de control obligatorio, entre ${L.controlPercentMin}% y ${L.controlPercentMax}%: sin él no se puede saber si el plan sirvió.`,
    );
  }
  if (
    !Array.isArray(p.variants) ||
    p.variants.length < 1 ||
    p.variants.length > L.variantsMax
  ) {
    add('variants', 'VARIANT_COUNT', `Entre 1 y ${L.variantsMax} variantes.`);
  } else {
    const keys = new Set<string>();
    let weights = 0;
    p.variants.forEach((v: unknown, i) => {
      const path = `variants[${i}]`;
      if (!isRecord(v)) {
        add(path, 'SHAPE', 'Variante inválida.');
        return;
      }
      if (
        typeof v.key !== 'string' ||
        !/^[A-Z]$/.test(v.key) ||
        keys.has(v.key)
      ) {
        add(
          `${path}.key`,
          'VARIANT_KEY',
          'Clave de una letra mayúscula, sin repetir.',
        );
      } else {
        keys.add(v.key);
      }
      if (!isInt(v.weightPercent) || v.weightPercent < 1) {
        add(`${path}.weightPercent`, 'RANGE', 'Peso entero positivo.');
      } else {
        weights += v.weightPercent;
      }

      let incentive: AuthorizedIncentive | null = null;
      if (v.incentiveId !== null) {
        incentive =
          typeof v.incentiveId === 'string'
            ? (ctx.incentives.get(v.incentiveId) ?? null)
            : null;
        if (!incentive) {
          add(
            `${path}.incentiveId`,
            'INCENTIVE_NOT_AUTHORIZED',
            'Ese incentivo no está en el catálogo autorizado por el dueño.',
          );
        } else if (incentive.unitCost === null) {
          add(
            `${path}.incentiveId`,
            'INCENTIVE_COST_UNKNOWN',
            `"${incentive.label}" no tiene costo estimable: no se puede ofrecer.`,
          );
        }
      }

      if (typeof v.message !== 'string') {
        add(`${path}.message`, 'TEXT', 'Falta el mensaje.');
        return;
      }
      const placeholders = v.message.match(/\{[^}]*\}/g) ?? [];
      const unknown = placeholders.filter(
        (ph) => !(MESSAGE_PLACEHOLDERS as readonly string[]).includes(ph),
      );
      if (unknown.length) {
        add(
          `${path}.message`,
          'PLACEHOLDER',
          `Marcadores no permitidos: ${unknown.join(', ')}. Solo ${MESSAGE_PLACEHOLDERS.join(', ')}.`,
        );
      }
      // Se valida con el marcador ya reemplazado, como lo va a leer el cliente.
      const copy = validateGeneratedCopy(
        v.message.replace(/\{nombre\}/g, 'Ana'),
        {
          percentageValue: incentive?.percentageValue ?? null,
          fixedValue: incentive?.fixedValue ?? null,
          expiresInDays: incentive?.expiresInDays ?? null,
          allowFreeWording: incentive?.allowFreeWording ?? false,
          allowRaffleWording: false,
          maxLength: L.messageMax,
        },
      );
      if (!copy.valid) {
        add(
          `${path}.message`,
          `COPY_${copy.reason}`,
          copyIssueMessage(copy.reason),
        );
      }
    });
    if (isInt(control) && weights + control !== 100) {
      add(
        'variants',
        'WEIGHTS',
        `Los pesos de las variantes (${weights}) más el control (${control}) tienen que sumar 100.`,
      );
    }
  }

  // ── Calendario, medición y corte ────────────────────────────────────────
  if (!isRecord(p.schedule)) {
    add('schedule', 'SHAPE', 'Falta el calendario.');
  } else {
    const start = p.schedule.startOn;
    if (start !== 'ASAP') {
      const ok = typeof start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(start);
      const offset = ok ? daysBetween(ctx.today, start) : NaN;
      if (!ok || !(offset >= 0 && offset <= L.startWithinDays)) {
        add(
          'schedule.startOn',
          'SCHEDULE',
          `'ASAP' o una fecha entre hoy y ${L.startWithinDays} días.`,
        );
      }
    }
    const within = p.schedule.sendWithinDays;
    if (!isInt(within) || within < 1 || within > L.sendWithinDaysMax) {
      add(
        'schedule.sendWithinDays',
        'RANGE',
        `Entre 1 y ${L.sendWithinDaysMax} días.`,
      );
    }
  }
  if (
    !isRecord(p.successMetric) ||
    !SUCCESS_METRICS.includes(p.successMetric.kind as SuccessMetricKind) ||
    !isInt(p.successMetric.windowDays) ||
    p.successMetric.windowDays < L.windowDaysMin ||
    p.successMetric.windowDays > L.windowDaysMax
  ) {
    add(
      'successMetric',
      'SUCCESS_METRIC',
      `Métrica ${SUCCESS_METRICS.join(' o ')} con ventana de ${L.windowDaysMin} a ${L.windowDaysMax} días.`,
    );
  }
  if (
    !isRecord(p.stopConditions) ||
    !isInt(p.stopConditions.maxOptOutPercent) ||
    p.stopConditions.maxOptOutPercent < L.optOutPercentMin ||
    p.stopConditions.maxOptOutPercent > L.optOutPercentMax ||
    !isInt(p.stopConditions.maxFailurePercent) ||
    p.stopConditions.maxFailurePercent < L.failurePercentMin ||
    p.stopConditions.maxFailurePercent > L.failurePercentMax
  ) {
    add(
      'stopConditions',
      'STOP_CONDITIONS',
      `Corte por bajas (${L.optOutPercentMin}–${L.optOutPercentMax}%) y por fallas (${L.failurePercentMin}–${L.failurePercentMax}%).`,
    );
  }

  if (issues.length) return { valid: false, issues };
  const plan = input as unknown as CommercialPlan;
  return { valid: true, plan, fingerprint: planFingerprint(plan) };
}

/**
 * Huella de "qué se le ofrece a quién": objetivo, regla canónica e
 * incentivos. Dos planes con la misma huella son el mismo plan aunque cambie
 * la redacción, y no se repiten mientras el primero se está midiendo.
 */
export function planFingerprint(
  plan: Pick<CommercialPlan, 'objective' | 'segment' | 'variants'>,
): string {
  const incentives = plan.variants
    .map((v) => v.incentiveId ?? 'none')
    .sort()
    .join(',');
  return createHash('sha256')
    .update(
      `${plan.objective}|${canonicalSegmentRule(plan.segment.rule)}|${incentives}`,
    )
    .digest('hex');
}

export interface PlanCostEstimate {
  recipients: number;
  /** Los que reciben mensaje (sin el control). */
  treated: number;
  control: number;
  messaging: number;
  /** Peor caso: todos los incentivos emitidos se canjean. */
  incentivesMaxLiability: number;
  total: number;
}

/**
 * Costo estimado de un plan ya validado para un grupo de `recipients`. El
 * reparto entre variantes se hace con los pesos; redondeo a centavos.
 * `withoutControl`: campaña exploratoria (grupo chico), todos reciben.
 */
export function estimatePlanCost(
  plan: Pick<CommercialPlan, 'variants' | 'controlPercent'>,
  recipients: number,
  incentives: ReadonlyMap<string, AuthorizedIncentive>,
  messageUnitCost: number,
  withoutControl = false,
): PlanCostEstimate {
  const money = (v: number) => Math.round(v * 100) / 100;
  const control = withoutControl
    ? 0
    : Math.round((recipients * plan.controlPercent) / 100);
  const treated = recipients - control;
  const totalWeight =
    plan.variants.reduce((s, v) => s + v.weightPercent, 0) || 1;
  const incentivesMaxLiability = plan.variants.reduce((sum, v) => {
    const unit = v.incentiveId
      ? (incentives.get(v.incentiveId)?.unitCost ?? 0)
      : 0;
    return sum + treated * (v.weightPercent / totalWeight) * unit;
  }, 0);
  const messaging = treated * messageUnitCost;
  return {
    recipients,
    treated,
    control,
    messaging: money(messaging),
    incentivesMaxLiability: money(incentivesMaxLiability),
    total: money(messaging + incentivesMaxLiability),
  };
}

function copyIssueMessage(reason: string): string {
  switch (reason) {
    case 'UNAUTHORIZED_PERCENTAGE':
      return 'El mensaje menciona un porcentaje que el incentivo elegido no tiene.';
    case 'UNAUTHORIZED_AMOUNT':
      return 'El mensaje menciona un monto que el incentivo elegido no tiene.';
    case 'UNAUTHORIZED_EXPIRY':
      return 'El mensaje promete un plazo distinto al del incentivo.';
    case 'UNAUTHORIZED_FREE_CLAIM':
      return 'El mensaje dice "gratis" y el incentivo no es un regalo.';
    case 'UNAUTHORIZED_RAFFLE_CLAIM':
      return 'El mensaje habla de un sorteo que no existe.';
    case 'CONTAINS_URL':
      return 'El mensaje no puede llevar links (el servidor agrega los suyos).';
    case 'CONTAINS_PHONE_LIKE_NUMBER':
      return 'El mensaje no puede llevar números de teléfono.';
    case 'INTERNAL_SEGMENT_LANGUAGE':
      return 'El mensaje deja ver lenguaje interno ("en riesgo", "te seguimos").';
    case 'TOO_LONG':
      return `El mensaje supera ${PLAN_LIMITS.messageMax} caracteres.`;
    default:
      return 'El mensaje está vacío o no es válido.';
  }
}
