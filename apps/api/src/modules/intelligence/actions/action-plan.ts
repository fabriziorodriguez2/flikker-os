import { createHash } from 'node:crypto';
import {
  BenefitType,
  CampaignChannel,
  IntelligenceActionKind,
  IntelligenceActionMode,
  MissionPeriodPreset,
} from '@prisma/client';
import { parseDay } from '../reports/report-math';

/**
 * Reglas puras de las acciones del agente: qué operaciones existen, en qué
 * modo corre cada una, el schema exacto de sus parámetros y las huellas
 * (`planHash`, `idempotencyKey`) que atan una confirmación a un plan.
 */

export const ACTION_MODE: Record<
  IntelligenceActionKind,
  IntelligenceActionMode
> = {
  CREATE_SEGMENT: IntelligenceActionMode.DRAFT,
  CREATE_CAMPAIGN_DRAFT: IntelligenceActionMode.DRAFT,
  UPDATE_CAMPAIGN_DRAFT: IntelligenceActionMode.DRAFT,
  CREATE_REWARD_DRAFT: IntelligenceActionMode.DRAFT,
  CREATE_MISSION_DRAFT: IntelligenceActionMode.DRAFT,
  SCHEDULE_CAMPAIGN: IntelligenceActionMode.CONFIRM,
  PAUSE_CAMPAIGN: IntelligenceActionMode.CONFIRM,
  UPDATE_STAMPS_CARD: IntelligenceActionMode.CONFIRM,
  ACTIVATE_BENEFIT: IntelligenceActionMode.CONFIRM,
  SET_MISSION_STATUS: IntelligenceActionMode.CONFIRM,
  SEND_PROMOTION: IntelligenceActionMode.DRY_RUN,
};

/** Una propuesta sin confirmar caduca sola: la foto de los datos envejece. */
export const PROPOSAL_TTL_MS = 30 * 60_000;

/** Audiencias cerradas de Promociones: no hay segment builder ni filtros arbitrarios. */
export const SEGMENT_AUDIENCES = [
  'todos',
  'volvieron',
  'ausentes',
  'cerca',
] as const;
export type SegmentAudience = (typeof SEGMENT_AUDIENCES)[number];

export const AUDIENCE_LABELS: Record<SegmentAudience, string> = {
  todos: 'Todos los clientes',
  volvieron: 'Clientes que volvieron',
  ausentes: 'Clientes ausentes (hace tiempo que no vienen)',
  cerca: 'Clientes cerca de completar la tarjeta',
};

/**
 * Canales de una campaña QR/link. Los de mensajería (WhatsApp, email, SMS)
 * quedan afuera: el agente no arma nada que se parezca a un envío.
 */
export const DRAFT_CAMPAIGN_CHANNELS: CampaignChannel[] = [
  CampaignChannel.QR_COUNTER,
  CampaignChannel.QR_TABLE,
  CampaignChannel.QR_CHECKOUT,
  CampaignChannel.QR_PACKAGING,
  CampaignChannel.SOCIAL_BIO,
  CampaignChannel.WEBSITE,
  CampaignChannel.IN_PERSON,
  CampaignChannel.EVENT,
  CampaignChannel.OTHER,
];

export const DRAFT_REWARD_TYPES: BenefitType[] = [
  BenefitType.discount,
  BenefitType.gift,
  BenefitType.promotion,
  BenefitType.upgrade,
  BenefitType.other,
];

/** CUSTOM necesita fechas exactas: para eso está la pantalla de Misiones. */
export const DRAFT_MISSION_PRESETS: MissionPeriodPreset[] = [
  MissionPeriodPreset.THIS_WEEK,
  MissionPeriodPreset.THIS_MONTH,
  MissionPeriodPreset.NEXT_N_DAYS,
];

// ---------------------------------------------------------------------------
// Parámetros
// ---------------------------------------------------------------------------

export type ActionParams = Record<string, string | number | boolean | null>;

type FieldSpec =
  | { type: 'string'; min?: number; max: number; nullable?: boolean }
  | { type: 'enum'; values: readonly string[]; nullable?: boolean }
  | { type: 'int'; min: number; max: number; nullable?: boolean }
  | { type: 'boolean'; nullable?: boolean }
  | { type: 'date'; nullable?: boolean }
  | { type: 'uuid' };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ACTION_FIELDS: Record<
  IntelligenceActionKind,
  Record<string, FieldSpec>
> = {
  CREATE_SEGMENT: {
    audience: { type: 'enum', values: SEGMENT_AUDIENCES },
  },
  CREATE_CAMPAIGN_DRAFT: {
    name: { type: 'string', min: 1, max: 120 },
    description: { type: 'string', max: 500, nullable: true },
    channel: { type: 'enum', values: DRAFT_CAMPAIGN_CHANNELS },
    destination: { type: 'enum', values: ['LANDING_ONLY', 'GOOGLE_REVIEW'] },
  },
  UPDATE_CAMPAIGN_DRAFT: {
    campaignId: { type: 'uuid' },
    name: { type: 'string', min: 1, max: 120, nullable: true },
    description: { type: 'string', max: 500, nullable: true },
  },
  CREATE_REWARD_DRAFT: {
    type: { type: 'enum', values: DRAFT_REWARD_TYPES },
    title: { type: 'string', min: 1, max: 120 },
    description: { type: 'string', max: 500, nullable: true },
    terms: { type: 'string', max: 500, nullable: true },
  },
  CREATE_MISSION_DRAFT: {
    name: { type: 'string', min: 1, max: 80 },
    description: { type: 'string', max: 300, nullable: true },
    targetVisits: { type: 'int', min: 1, max: 30 },
    periodPreset: { type: 'enum', values: DRAFT_MISSION_PRESETS },
    periodDays: { type: 'int', min: 1, max: 90, nullable: true },
    rewardBenefitId: { type: 'uuid' },
  },
  SCHEDULE_CAMPAIGN: {
    campaignId: { type: 'uuid' },
    startsOn: { type: 'date' },
    endsOn: { type: 'date', nullable: true },
  },
  PAUSE_CAMPAIGN: {
    campaignId: { type: 'uuid' },
  },
  UPDATE_STAMPS_CARD: {
    stampsRequired: { type: 'int', min: 1, max: 20 },
    /** null = dejar como está: el modelo no decide lo que nadie pidió. */
    feedbackBonusEnabled: { type: 'boolean', nullable: true },
  },
  ACTIVATE_BENEFIT: {
    benefitId: { type: 'uuid' },
  },
  SET_MISSION_STATUS: {
    missionId: { type: 'uuid' },
    status: { type: 'enum', values: ['ACTIVE', 'PAUSED'] },
  },
  SEND_PROMOTION: {
    audience: { type: 'enum', values: SEGMENT_AUDIENCES },
    message: { type: 'string', min: 5, max: 1000 },
    benefitId: { type: 'uuid' },
  },
};

/** El premio de una misión y el beneficio de una promoción son opcionales. */
const OPTIONAL_UUIDS = new Set([
  'CREATE_MISSION_DRAFT.rewardBenefitId',
  'SEND_PROMOTION.benefitId',
]);

/**
 * Exactamente las claves del schema, cada una con su tipo. Cualquier clave
 * extra (un `businessId`, un `status` que no corresponde) invalida todo.
 */
export function parseActionParams(
  kind: IntelligenceActionKind,
  raw: unknown,
): ActionParams | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    return null;
  const fields = ACTION_FIELDS[kind];
  const input = raw as Record<string, unknown>;
  const keys = Object.keys(fields);
  if (Object.keys(input).some((k) => !keys.includes(k))) return null;

  const out: ActionParams = {};
  for (const key of keys) {
    if (!(key in input)) return null;
    const value = input[key];
    const spec = fields[key];
    const nullable =
      ('nullable' in spec && spec.nullable) ||
      OPTIONAL_UUIDS.has(`${kind}.${key}`);
    if (value === null) {
      if (!nullable) return null;
      out[key] = null;
      continue;
    }
    switch (spec.type) {
      case 'string': {
        if (typeof value !== 'string') return null;
        const trimmed = value.trim();
        if (trimmed.length < (spec.min ?? 0) || trimmed.length > spec.max)
          return null;
        out[key] = trimmed;
        break;
      }
      case 'enum':
        if (typeof value !== 'string' || !spec.values.includes(value))
          return null;
        out[key] = value;
        break;
      case 'int':
        if (
          !Number.isInteger(value) ||
          (value as number) < spec.min ||
          (value as number) > spec.max
        )
          return null;
        out[key] = value as number;
        break;
      case 'boolean':
        if (typeof value !== 'boolean') return null;
        out[key] = value;
        break;
      case 'date':
        if (!parseDay(value)) return null;
        out[key] = value as string;
        break;
      case 'uuid':
        if (typeof value !== 'string' || !UUID_RE.test(value)) return null;
        out[key] = value.toLowerCase();
        break;
    }
  }
  return out;
}

/** JSON Schema estricto (Responses API, `strict: true`) a partir del mismo schema. */
export function actionJsonSchema(kind: IntelligenceActionKind) {
  const fields = ACTION_FIELDS[kind];
  const properties: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(fields)) {
    const nullable =
      ('nullable' in spec && spec.nullable) ||
      OPTIONAL_UUIDS.has(`${kind}.${key}`);
    const typed = (base: string) => (nullable ? [base, 'null'] : base);
    switch (spec.type) {
      case 'string':
        properties[key] = { type: typed('string'), maxLength: spec.max };
        break;
      case 'enum':
        properties[key] = {
          type: typed('string'),
          enum: nullable ? [...spec.values, null] : [...spec.values],
        };
        break;
      case 'int':
        properties[key] = {
          type: typed('integer'),
          minimum: spec.min,
          maximum: spec.max,
        };
        break;
      case 'boolean':
        properties[key] = { type: typed('boolean') };
        break;
      case 'date':
        properties[key] = {
          type: typed('string'),
          description: 'Fecha local AAAA-MM-DD.',
        };
        break;
      case 'uuid':
        properties[key] = {
          type: typed('string'),
          description: 'Id exacto, tal como vino de una consulta.',
        };
        break;
    }
  }
  return {
    type: 'object',
    properties,
    required: Object.keys(fields),
    additionalProperties: false,
  };
}

// ---------------------------------------------------------------------------
// Huellas
// ---------------------------------------------------------------------------

/** JSON con claves ordenadas: el mismo objeto da siempre el mismo texto. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  // Date (y Decimal): por su forma JSON. Sin esto, un Date no tiene claves
  // propias y se volvería `{}`: la huella ignoraría fechas y `updatedAt`.
  if (typeof (value as { toJSON?: unknown }).toJSON === 'function') {
    return canonicalJson((value as { toJSON: () => unknown }).toJSON());
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** Lo que el dueño confirma: la operación, sus parámetros y la versión de los datos. */
export function computePlanHash(
  kind: IntelligenceActionKind,
  params: ActionParams,
  dataVersion: string | null,
): string {
  return sha256(canonicalJson({ kind, params, dataVersion }));
}

/** Mismo mensaje del dueño + misma operación + mismos parámetros = misma acción. */
export function computeIdempotencyKey(
  sourceMessageId: string,
  kind: IntelligenceActionKind,
  params: ActionParams,
): string {
  return sha256(canonicalJson({ sourceMessageId, kind, params }));
}

/** Huella del estado actual de lo que la acción va a tocar. */
export function computeDataVersion(snapshot: unknown): string {
  return sha256(canonicalJson(snapshot)).slice(0, 32);
}

// ---------------------------------------------------------------------------
// Pedido explícito
// ---------------------------------------------------------------------------

const ACTION_VERBS =
  'paus|program|activ|reactiv|reanud|cambi|modific|configur|actualiz|mand|envi';

/**
 * ¿El dueño PIDIÓ un cambio en este mensaje? Las acciones con impacto (Modo
 * B) solo se ofrecen al modelo si sí: nunca por iniciativa propia.
 *
 * Imperativo con voseo y tilde ("pausá", "activala"), o un infinitivo detrás
 * de un pedido ("quiero pausar", "¿podés activar…?"). "¿Por qué no está
 * activo?" o "¿cómo programo una campaña?" no son pedidos.
 */
const IMPERATIVE = new RegExp(
  // Con pronombre pegado el voseo pierde la tilde: "pausala", "activalo".
  `(?<!\\p{L})(?:${ACTION_VERBS})(?:á|a(?:la|lo|las|los|le|me))(?!\\p{L})|(?<!\\p{L})(?:poné|ponela|ponelo|subí|bajá)(?!\\p{L})`,
  'iu',
);
const REQUEST_WITH_INFINITIVE = new RegExp(
  `(?<!\\p{L})(?:quiero|quisiera|necesito|podés|podrías|puedes|me\\s+gustaría|hay\\s+que)\\s+(?:(?:me|la|lo)\\s+)?(?:${ACTION_VERBS})(?:ar|er|ir)(?:la|lo|las|los)?(?!\\p{L})`,
  'iu',
);

export function isExplicitActionRequest(text: string): boolean {
  return IMPERATIVE.test(text) || REQUEST_WITH_INFINITIVE.test(text);
}
