import { CustomerSegment } from '@prisma/client';

/**
 * Segmentos dinámicos de un plan comercial: condiciones combinables sobre una
 * lista CERRADA de rasgos de cliente que el servidor calcula. La IA arma la
 * regla; el servidor la valida y la evalúa en memoria contra los rasgos
 * reales. Nunca se traduce a SQL ni se ejecuta texto del modelo.
 *
 * Los rasgos son agregados de comportamiento (visitas, cadencia, premios,
 * contactos): ninguno es un dato personal, así que la regla puede viajar al
 * modelo y volver sin exponer a nadie.
 */

type NumericField =
  | 'visitCount'
  | 'visitsLast30Days'
  | 'visitsLast90Days'
  | 'daysSinceFirstVisit'
  | 'daysSinceLastVisit'
  /** Mediana de días entre visitas; null sin historia suficiente. */
  | 'typicalIntervalDays'
  /** daysSinceLastVisit / typicalIntervalDays; null sin cadencia propia. */
  | 'overdueRatio'
  /** Visitas que le faltan para su premio activo; null sin tarjeta activa. */
  | 'rewardRemainingVisits'
  | 'unredeemedBenefits'
  /** Días hasta que vence su beneficio sin canjear más próximo; null si no tiene. */
  | 'daysToNearestBenefitExpiry'
  | 'redemptionsLast90Days'
  /** Días desde el último mensaje de marketing; null si nunca se le escribió. */
  | 'daysSinceLastContact';

type CategoricalField = 'segment';

export type SegmentField = NumericField | CategoricalField;

/** Rasgos de un cliente, calculados por el servidor. */
export type CustomerFeatures = Record<NumericField, number | null> & {
  segment: CustomerSegment;
};

export const NUMERIC_FIELDS: readonly NumericField[] = [
  'visitCount',
  'visitsLast30Days',
  'visitsLast90Days',
  'daysSinceFirstVisit',
  'daysSinceLastVisit',
  'typicalIntervalDays',
  'overdueRatio',
  'rewardRemainingVisits',
  'unredeemedBenefits',
  'daysToNearestBenefitExpiry',
  'redemptionsLast90Days',
  'daysSinceLastContact',
];

/** Qué significa cada rasgo, para el prompt y para explicarle al dueño. */
export const FIELD_DESCRIPTIONS: Record<SegmentField, string> = {
  visitCount: 'Visitas totales registradas.',
  visitsLast30Days: 'Visitas en los últimos 30 días.',
  visitsLast90Days: 'Visitas en los últimos 90 días.',
  daysSinceFirstVisit: 'Días desde su primera visita.',
  daysSinceLastVisit: 'Días desde su última visita.',
  typicalIntervalDays:
    'Su frecuencia habitual: mediana de días entre visitas (vacío sin historia suficiente).',
  overdueRatio:
    'Días desde la última visita dividido su frecuencia habitual (más de 1 = está tardando más de lo normal).',
  rewardRemainingVisits:
    'Visitas que le faltan para el premio de su tarjeta activa (vacío si no tiene).',
  unredeemedBenefits: 'Beneficios emitidos que todavía no canjeó.',
  daysToNearestBenefitExpiry:
    'Días hasta que vence su beneficio sin canjear más próximo (vacío si no tiene).',
  redemptionsLast90Days: 'Canjes en los últimos 90 días.',
  daysSinceLastContact:
    'Días desde el último mensaje de marketing (vacío si nunca se le escribió).',
  segment:
    'Etapa del cliente: NEW, REPEAT, FREQUENT, AT_RISK, INACTIVE o RECOVERED.',
};

export type SegmentOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between'
  | 'in'
  | 'is_null'
  | 'not_null';

export interface SegmentCondition {
  field: SegmentField;
  op: SegmentOperator;
  /** Número; [min, max] para between; lista para in; ausente para is_null/not_null. */
  value?: number | string | (number | string)[] | null;
}

export type SegmentRule =
  | { all: SegmentRule[] }
  | { any: SegmentRule[] }
  | { not: SegmentRule }
  | SegmentCondition;

/** Límites para que una regla siga siendo legible y barata de evaluar. */
export const MAX_SEGMENT_DEPTH = 4;
export const MAX_SEGMENT_CONDITIONS = 12;

const NUMERIC_OPS: SegmentOperator[] = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'between',
  'is_null',
  'not_null',
];
const CATEGORICAL_OPS: SegmentOperator[] = ['eq', 'neq', 'in'];
const SEGMENTS = Object.values(CustomerSegment) as string[];

export interface SegmentIssue {
  path: string;
  message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/** Valida la forma y los valores de una regla que vino del modelo. */
export function validateSegmentRule(rule: unknown): SegmentIssue[] {
  const issues: SegmentIssue[] = [];
  let conditions = 0;

  const visit = (node: unknown, path: string, depth: number) => {
    if (depth > MAX_SEGMENT_DEPTH) {
      issues.push({ path, message: `Más de ${MAX_SEGMENT_DEPTH} niveles.` });
      return;
    }
    if (!isRecord(node)) {
      issues.push({ path, message: 'Se esperaba un objeto.' });
      return;
    }
    const keys = Object.keys(node);
    if ('all' in node || 'any' in node) {
      const key = 'all' in node ? 'all' : 'any';
      const children = node[key];
      if (keys.length !== 1 || !Array.isArray(children) || !children.length) {
        issues.push({
          path,
          message: `"${key}" debe ser la única clave y tener al menos una condición.`,
        });
        return;
      }
      children.forEach((child, i) =>
        visit(child, `${path}.${key}[${i}]`, depth + 1),
      );
      return;
    }
    if ('not' in node) {
      if (keys.length !== 1) {
        issues.push({ path, message: '"not" debe ser la única clave.' });
        return;
      }
      visit(node.not, `${path}.not`, depth + 1);
      return;
    }

    conditions += 1;
    const { field, op, value } = node;
    const allowedKeys = new Set(['field', 'op', 'value']);
    if (keys.some((k) => !allowedKeys.has(k))) {
      issues.push({ path, message: 'Claves desconocidas en la condición.' });
    }
    if (typeof field !== 'string' || !(field in FIELD_DESCRIPTIONS)) {
      issues.push({ path, message: `Rasgo desconocido: ${String(field)}.` });
      return;
    }
    if (field === 'segment') {
      if (!CATEGORICAL_OPS.includes(op as SegmentOperator)) {
        issues.push({
          path,
          message: `Operador inválido para segment: ${String(op)}.`,
        });
        return;
      }
      const values = op === 'in' ? value : [value];
      if (
        !Array.isArray(values) ||
        !values.length ||
        values.some((v) => typeof v !== 'string' || !SEGMENTS.includes(v))
      ) {
        issues.push({
          path,
          message: `Valores de segment válidos: ${SEGMENTS.join(', ')}.`,
        });
      }
      return;
    }
    if (!NUMERIC_OPS.includes(op as SegmentOperator)) {
      issues.push({
        path,
        message: `Operador inválido para ${field}: ${String(op)}.`,
      });
      return;
    }
    if (op === 'is_null' || op === 'not_null') {
      if (value !== undefined && value !== null) {
        issues.push({ path, message: `${op} no lleva valor.` });
      }
      return;
    }
    if (op === 'between') {
      if (
        !Array.isArray(value) ||
        value.length !== 2 ||
        !value.every(isFiniteNumber) ||
        value[0] > value[1]
      ) {
        issues.push({
          path,
          message: 'between espera [mínimo, máximo] numérico.',
        });
      }
      return;
    }
    if (!isFiniteNumber(value)) {
      issues.push({
        path,
        message: `${field} ${String(op)} espera un número.`,
      });
    }
  };

  visit(rule, 'segment.rule', 1);
  if (conditions > MAX_SEGMENT_CONDITIONS) {
    issues.push({
      path: 'segment.rule',
      message: `Más de ${MAX_SEGMENT_CONDITIONS} condiciones.`,
    });
  }
  return issues;
}

/**
 * ¿Este cliente entra en la regla? Una condición numérica sobre un rasgo
 * vacío (null) nunca se cumple, salvo `is_null`: "sin cadencia" no es
 * "cadencia 0".
 */
export function matchesSegment(
  rule: SegmentRule,
  features: CustomerFeatures,
): boolean {
  if ('all' in rule) return rule.all.every((r) => matchesSegment(r, features));
  if ('any' in rule) return rule.any.some((r) => matchesSegment(r, features));
  if ('not' in rule) return !matchesSegment(rule.not, features);

  const { field, op, value } = rule;
  if (field === 'segment') {
    const current = features.segment as string;
    if (op === 'in') return (value as string[]).includes(current);
    if (op === 'eq') return current === value;
    return current !== value;
  }

  const actual = features[field];
  if (op === 'is_null') return actual === null;
  if (op === 'not_null') return actual !== null;
  if (actual === null) return false;
  switch (op) {
    case 'eq':
      return actual === value;
    case 'neq':
      return actual !== value;
    case 'gt':
      return actual > (value as number);
    case 'gte':
      return actual >= (value as number);
    case 'lt':
      return actual < (value as number);
    case 'lte':
      return actual <= (value as number);
    case 'between': {
      const [min, max] = value as [number, number];
      return actual >= min && actual <= max;
    }
    default:
      return false;
  }
}

/** Forma canónica (claves y listas ordenadas) para comparar reglas. */
export function canonicalSegmentRule(rule: SegmentRule): string {
  const canon = (node: SegmentRule): unknown => {
    if ('all' in node) {
      return {
        all: node.all
          .map(canon)
          .map((c) => JSON.stringify(c))
          .sort(),
      };
    }
    if ('any' in node) {
      return {
        any: node.any
          .map(canon)
          .map((c) => JSON.stringify(c))
          .sort(),
      };
    }
    if ('not' in node) return { not: canon(node.not) };
    const value = Array.isArray(node.value)
      ? node.op === 'between'
        ? node.value
        : [...node.value].map(String).sort()
      : (node.value ?? null);
    return { field: node.field, op: node.op, value };
  };
  return JSON.stringify(canon(rule));
}
