import type {
  ConsentAction,
  MembershipRole,
  PolicyEffectSource,
  PolicyPauseReason,
} from '@prisma/client';
import { getLocalDateTimeParts } from '../../common/utils/timezone.util';

/**
 * Reglas duras del motor de políticas. Funciones puras: el servicio junta
 * los hechos (configuración, uso del mes, consentimientos, contactos
 * recientes) y esto decide. Ningún texto del modelo ni del cliente entra
 * acá: solo números que el servidor leyó de la base.
 */

/**
 * Sube cuando cambia el texto de la política: obliga a volver a aceptarla.
 * v2: tope semanal como % de la base contactable, presupuesto de incentivos
 * definido por el dueño y tope por campaña sobre cada bolsa.
 */
export const POLICY_VERSION = 2;

/**
 * Por debajo de esta cantidad de clientes registrados no hay tope semanal
 * por porcentaje: con una base chica el % deja grupos sin sentido. Intelligence
 * decide cuántos contactar y el motor sigue validando presupuesto,
 * consentimiento y frecuencia por persona.
 */
export const SMALL_BUSINESS_CUSTOMER_THRESHOLD = 150;

/** Versión vigente del texto de WhatsApp (ver consent-texts.ts). */
export { CONSENT_TEXT_VERSIONS } from './consent-texts';

/** Cuánto vive una reserva sin confirmarse antes de dejar de contar. */
export const RESERVATION_TTL_MS = 60 * 60_000;

const MS_PER_DAY = 86_400_000;

/** Redondeo a centavos: los topes se comparan en la misma unidad que se guardan. */
function money(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Preset "Equilibrado". Es el punto de partida que ve el dueño, editable;
 * nunca se aplica solo. Los montos están en la moneda que confirme. El
 * presupuesto de incentivos no tiene propuesta: lo decide el dueño, y hasta
 * entonces no se ofrece ningún premio con costo.
 */
export const BALANCED_PRESET = {
  messagingBudgetMonthly: 500,
  incentiveBudgetMonthly: null,
  weeklyReachPercent: 25,
  maxNewCampaignsPerWeek: 2,
  minDaysBetweenPromotions: 10,
  maxPromotionsPer30Days: 3,
  sendingHourStart: 10,
  sendingHourEnd: 20,
  maxCampaignSharePercent: 25,
} as const;

/** Configuración resuelta: lo propio de la política más lo que vive en RetentionSettings. */
export interface PolicyConfig {
  acceptedAt: Date | null;
  acceptedVersion: number | null;
  confirmedCurrency: string | null;
  confirmedTimezone: string | null;
  businessCurrency: string;
  businessTimezone: string;
  paused: boolean;
  pausedReason: PolicyPauseReason | null;
  messagingBudgetMonthly: number | null;
  /** null = el dueño todavía no lo definió: ningún premio con costo. */
  incentiveBudgetMonthly: number | null;
  weeklyReachPercent: number | null;
  maxNewCampaignsPerWeek: number | null;
  maxCampaignSharePercent: number | null;
  minDaysBetweenPromotions: number;
  maxPromotionsPer30Days: number;
  sendingHourStart: number;
  sendingHourEnd: number;
  allowedSendingDays: number[];
  messageUnitCost: number | null;
  messageUnitCostCurrency: string | null;
}

export type ConsentStatus = 'GRANTED' | 'REVOKED' | 'SUPPRESSED' | 'UNKNOWN';

/** Un efecto externo que alguien quiere producir. */
export interface PolicyEffect {
  source: PolicyEffectSource;
  /** Quién lo pide; null = el sistema (Autopilot). */
  actorRole: MembershipRole | null;
  /** MESSAGE: le escribe a clientes. PROGRAM: cambia lo que reciben al visitar. */
  kind: 'MESSAGE' | 'PROGRAM';
  createsCampaign: boolean;
  candidateCustomerIds: string[];
  /**
   * Premio emitido por destinatario. `unitCost: null` = no se puede estimar,
   * que bloquea: nunca se ofrece algo cuyo costo no se conoce.
   * `zeroCostVerified`: el dueño declaró costo 0 y no lleva descuento (ver
   * `isVerifiedZeroCost`); es lo único que sale sin presupuesto de incentivos.
   */
  incentive: { unitCost: number | null; zeroCostVerified?: boolean } | null;
}

/** Lo que ya está usado o en vuelo, leído por el servidor. */
export interface PolicyUsage {
  messagingSpentMonth: number;
  incentiveLiabilityMonth: number;
  recipientsThisWeek: ReadonlySet<string>;
  newCampaignsThisWeek: number;
  /** Base del negocio para el tope semanal. */
  base: CustomerBase;
  /** Contactos de marketing de los últimos 30 días, por candidato. */
  contactsByCustomer: ReadonlyMap<string, readonly Date[]>;
  consentByCustomer: ReadonlyMap<string, ConsentStatus>;
}

export interface CustomerBase {
  /** Clientes activos registrados. */
  registered: number;
  /** Clientes activos únicos que hoy pueden recibir promociones por WhatsApp. */
  contactable: number;
}

export interface WeeklyCap {
  /** ADAPTIVE: base chica, sin tope por %. PERCENT: % de la base contactable. */
  mode: 'ADAPTIVE' | 'PERCENT';
  /** Clientes distintos por semana; null = sin tope (ADAPTIVE o sin configurar). */
  cap: number | null;
}

/**
 * Tope de clientes distintos por semana. Se recalcula en cada evaluación con
 * la base de ese momento: crece cuando crece la base contactable.
 */
export function weeklyRecipientCap(
  config: Pick<PolicyConfig, 'weeklyReachPercent'>,
  base: CustomerBase,
): WeeklyCap {
  if (base.registered < SMALL_BUSINESS_CUSTOMER_THRESHOLD) {
    return { mode: 'ADAPTIVE', cap: null };
  }
  if (config.weeklyReachPercent === null) return { mode: 'PERCENT', cap: null };
  return {
    mode: 'PERCENT',
    cap: Math.ceil((base.contactable * config.weeklyReachPercent) / 100),
  };
}

/** Lo máximo que puede usar UNA campaña de cada bolsa; null = sin bolsa. */
export function campaignCaps(
  config: Pick<
    PolicyConfig,
    | 'messagingBudgetMonthly'
    | 'incentiveBudgetMonthly'
    | 'maxCampaignSharePercent'
  >,
): { messaging: number | null; incentives: number | null } {
  const share = config.maxCampaignSharePercent;
  const part = (budget: number | null) =>
    budget === null || share === null ? null : money((budget * share) / 100);
  return {
    messaging: part(config.messagingBudgetMonthly),
    incentives: part(config.incentiveBudgetMonthly),
  };
}

/**
 * Regla de frecuencia por persona, sobre los contactos de marketing de los
 * últimos 30 días de TODOS los motores (promociones, Autopilot, Intelligence).
 * Es un máximo: nada obliga a llegar a él.
 */
export function frequencyExclusion(
  contacts: readonly Date[],
  config: Pick<
    PolicyConfig,
    'minDaysBetweenPromotions' | 'maxPromotionsPer30Days'
  >,
  now: Date,
): 'RECENT_PROMOTION' | 'MONTHLY_PROMOTION_LIMIT' | null {
  const recent = contacts.filter(
    (at) => now.getTime() - at.getTime() < 30 * MS_PER_DAY,
  );
  const last = recent.reduce<number | null>(
    (max, at) => (max === null || at.getTime() > max ? at.getTime() : max),
    null,
  );
  if (
    last !== null &&
    now.getTime() - last < config.minDaysBetweenPromotions * MS_PER_DAY
  ) {
    return 'RECENT_PROMOTION';
  }
  if (recent.length >= config.maxPromotionsPer30Days) {
    return 'MONTHLY_PROMOTION_LIMIT';
  }
  return null;
}

export type PolicyBlockerCode =
  | 'ROLE_NOT_ALLOWED'
  | 'POLICY_NOT_ACCEPTED'
  | 'POLICY_OUTDATED'
  | 'POLICY_RECONFIRM_REQUIRED'
  | 'POLICY_PAUSED'
  | 'OUTSIDE_SENDING_WINDOW'
  | 'MESSAGE_COST_UNKNOWN'
  | 'MESSAGE_COST_CURRENCY_MISMATCH'
  | 'INCENTIVE_COST_UNKNOWN'
  | 'BUDGET_NOT_CONFIGURED'
  | 'INCENTIVE_BUDGET_NOT_SET'
  | 'NO_ELIGIBLE_RECIPIENTS'
  | 'WEEKLY_RECIPIENTS_LIMIT'
  | 'WEEKLY_CAMPAIGNS_LIMIT'
  | 'MESSAGING_BUDGET_EXCEEDED'
  | 'INCENTIVE_BUDGET_EXCEEDED'
  | 'CAMPAIGN_SHARE_EXCEEDED';

export type ExclusionReason =
  | 'NO_CONSENT'
  | 'CONSENT_REVOKED'
  | 'SUPPRESSED'
  | 'RECENT_PROMOTION'
  | 'MONTHLY_PROMOTION_LIMIT';

export interface PolicyBlocker {
  code: PolicyBlockerCode;
  message: string;
}

export interface PolicyDecision {
  allowed: boolean;
  blockers: PolicyBlocker[];
  excluded: { customerId: string; reason: ExclusionReason }[];
  eligibleCustomerIds: string[];
  cost: {
    currency: string;
    messaging: number;
    incentives: number;
    total: number;
  };
}

/**
 * Roles que pueden producir cada efecto. Leer la política es de cualquier
 * miembro; producir efectos con costo, no.
 */
export function roleMayProduce(
  effect: Pick<PolicyEffect, 'source' | 'actorRole' | 'incentive' | 'kind'>,
): boolean {
  if (effect.source === 'AUTOPILOT') return effect.actorRole === null;
  if (effect.actorRole === null) return false;
  if (effect.actorRole === 'OWNER' || effect.actorRole === 'ADMIN') return true;
  // OPERATOR conserva lo que ya podía: mandar una promoción SIN premio.
  return (
    effect.source === 'PROMOTION' &&
    effect.kind === 'MESSAGE' &&
    effect.incentive === null &&
    effect.actorRole === 'OPERATOR'
  );
}

/** Estado vigente de un canal. La ausencia de eventos NO es autorización. */
export function effectiveConsent(
  events: readonly { action: ConsentAction; createdAt: Date }[],
  legacyOptedOut: boolean,
): ConsentStatus {
  const ordered = [...events].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  let suppressed = false;
  let latest: 'GRANTED' | 'REVOKED' | null = null;
  for (const event of ordered) {
    if (event.action === 'SUPPRESSED') suppressed = true;
    else if (event.action === 'UNSUPPRESSED') suppressed = false;
    else latest = event.action;
  }
  if (suppressed) return 'SUPPRESSED';
  // Espejo de compatibilidad: una baja vieja (o de un camino que todavía no
  // escribe eventos) gana sobre cualquier GRANTED.
  if (legacyOptedOut) return 'REVOKED';
  return latest ?? 'UNKNOWN';
}

/** Ventana horaria local; misma regla que Autopilot (`RetentionSettings`). */
export function isWithinWindow(
  config: Pick<
    PolicyConfig,
    'sendingHourStart' | 'sendingHourEnd' | 'allowedSendingDays'
  >,
  timezone: string,
  now: Date,
): boolean {
  const { year, month, day, hour } = getLocalDateTimeParts(now, timezone);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const isoWeekday = weekday === 0 ? 7 : weekday;
  if (
    config.allowedSendingDays.length > 0 &&
    !config.allowedSendingDays.includes(isoWeekday)
  ) {
    return false;
  }
  return hour >= config.sendingHourStart && hour < config.sendingHourEnd;
}

/** Los problemas de configuración, sin mirar ningún efecto concreto. */
export function configBlockers(config: PolicyConfig): PolicyBlocker[] {
  if (!config.acceptedAt) {
    return [
      {
        code: 'POLICY_NOT_ACCEPTED',
        message:
          'Tu negocio todavía no aceptó la política de envíos y costos (Configuración → Políticas).',
      },
    ];
  }
  const blockers: PolicyBlocker[] = [];
  if ((config.acceptedVersion ?? 0) < POLICY_VERSION) {
    blockers.push({
      code: 'POLICY_OUTDATED',
      message:
        'La política cambió desde que la aceptaste: revisala y aceptala de nuevo.',
    });
  }
  if (
    config.confirmedCurrency !== config.businessCurrency ||
    config.confirmedTimezone !== config.businessTimezone
  ) {
    blockers.push({
      code: 'POLICY_RECONFIRM_REQUIRED',
      message:
        'La moneda o la zona horaria del negocio cambió: confirmalas de nuevo en Políticas.',
    });
  }
  if (config.paused) {
    blockers.push({
      code: 'POLICY_PAUSED',
      message:
        config.pausedReason && config.pausedReason !== 'MANUAL'
          ? 'Los envíos están pausados automáticamente por seguridad. Revisá Políticas para reanudarlos.'
          : 'Los envíos y cambios con costo están pausados (Políticas → Reanudar).',
    });
  }
  return blockers;
}

/**
 * La decisión completa. Bloquea todo el efecto cuando una regla de negocio
 * (presupuesto, topes semanales, configuración) dice que no; excluye
 * destinatarios puntuales cuando la regla es por persona (consentimiento,
 * frecuencia). Nunca recorta un efecto para que entre en un tope: eso lo
 * decide el dueño.
 */
export function evaluatePolicy(input: {
  config: PolicyConfig;
  effect: PolicyEffect;
  usage: PolicyUsage;
  now: Date;
}): PolicyDecision {
  const { config, effect, usage, now } = input;
  const blockers: PolicyBlocker[] = [];
  const currency = config.confirmedCurrency ?? config.businessCurrency;
  const empty: PolicyDecision['cost'] = {
    currency,
    messaging: 0,
    incentives: 0,
    total: 0,
  };

  if (!roleMayProduce(effect)) {
    return {
      allowed: false,
      blockers: [
        {
          code: 'ROLE_NOT_ALLOWED',
          message: 'Tu rol no permite producir este efecto.',
        },
      ],
      excluded: [],
      eligibleCustomerIds: [],
      cost: empty,
    };
  }

  blockers.push(...configBlockers(config));
  if (blockers.some((b) => b.code === 'POLICY_NOT_ACCEPTED')) {
    return {
      allowed: false,
      blockers,
      excluded: [],
      eligibleCustomerIds: [],
      cost: empty,
    };
  }

  if (effect.incentive) {
    if (effect.incentive.unitCost === null) {
      blockers.push({
        code: 'INCENTIVE_COST_UNKNOWN',
        message:
          'No se puede estimar el costo de ese beneficio: cargale un costo estimado (Programa → Beneficios → Reactivación) antes de ofrecerlo.',
      });
    }
    const zeroCost =
      effect.incentive.zeroCostVerified === true &&
      effect.incentive.unitCost === 0;
    if (config.incentiveBudgetMonthly === null && !zeroCost) {
      blockers.push({
        code: 'INCENTIVE_BUDGET_NOT_SET',
        message:
          'Todavía no definiste un presupuesto de incentivos (Políticas): hasta entonces solo salen acciones sin beneficios con costo.',
      });
    }
  }

  if (effect.kind === 'PROGRAM') {
    return {
      allowed: blockers.length === 0,
      blockers,
      excluded: [],
      eligibleCustomerIds: [],
      cost: empty,
    };
  }

  // ── Mensajes ──────────────────────────────────────────────────────────
  if (!isWithinWindow(config, config.businessTimezone, now)) {
    blockers.push({
      code: 'OUTSIDE_SENDING_WINDOW',
      message: `Fuera del horario permitido (${config.sendingHourStart} a ${config.sendingHourEnd} h, hora del negocio).`,
    });
  }
  if (config.messageUnitCost === null) {
    blockers.push({
      code: 'MESSAGE_COST_UNKNOWN',
      message:
        'Flikker todavía no cargó el costo por mensaje de tu negocio: sin eso no se puede controlar el presupuesto.',
    });
  } else if (config.messageUnitCostCurrency !== currency) {
    blockers.push({
      code: 'MESSAGE_COST_CURRENCY_MISMATCH',
      message:
        'El costo por mensaje está en otra moneda que la de tu negocio: pedile a Flikker que lo actualice.',
    });
  }
  const capsMissing =
    config.messagingBudgetMonthly === null ||
    config.weeklyReachPercent === null ||
    config.maxNewCampaignsPerWeek === null ||
    config.maxCampaignSharePercent === null;
  if (capsMissing) {
    blockers.push({
      code: 'BUDGET_NOT_CONFIGURED',
      message:
        'Faltan topes de la política (presupuesto de mensajería, alcance semanal o campañas por semana).',
    });
  }

  // Por persona: consentimiento y frecuencia. Un id repetido cuenta una vez.
  const excluded: PolicyDecision['excluded'] = [];
  const eligible: string[] = [];
  const seen = new Set<string>();
  for (const customerId of effect.candidateCustomerIds) {
    if (seen.has(customerId)) continue;
    seen.add(customerId);
    const consent = usage.consentByCustomer.get(customerId) ?? 'UNKNOWN';
    if (consent !== 'GRANTED') {
      excluded.push({
        customerId,
        reason:
          consent === 'SUPPRESSED'
            ? 'SUPPRESSED'
            : consent === 'REVOKED'
              ? 'CONSENT_REVOKED'
              : 'NO_CONSENT',
      });
      continue;
    }
    const frequency = frequencyExclusion(
      usage.contactsByCustomer.get(customerId) ?? [],
      config,
      now,
    );
    if (frequency) {
      excluded.push({ customerId, reason: frequency });
      continue;
    }
    eligible.push(customerId);
  }

  if (eligible.length === 0) {
    blockers.push({
      code: 'NO_ELIGIBLE_RECIPIENTS',
      message:
        'Ningún destinatario cumple las reglas (consentimiento de WhatsApp y frecuencia máxima).',
    });
  }

  const messaging = money(eligible.length * (config.messageUnitCost ?? 0));
  const incentives = money(eligible.length * (effect.incentive?.unitCost ?? 0));
  const total = money(messaging + incentives);
  const cost = { currency, messaging, incentives, total };

  if (!capsMissing && eligible.length > 0) {
    const weekly = weeklyRecipientCap(config, usage.base);
    // Quien ya recibió algo esta semana no vuelve a sumar.
    const newRecipients = eligible.filter(
      (id) => !usage.recipientsThisWeek.has(id),
    ).length;
    if (
      weekly.cap !== null &&
      usage.recipientsThisWeek.size + newRecipients > weekly.cap
    ) {
      blockers.push({
        code: 'WEEKLY_RECIPIENTS_LIMIT',
        message: `Supera el alcance semanal: ${weekly.cap} clientes distintos (el ${config.weeklyReachPercent}% de ${usage.base.contactable} contactables; ya van ${usage.recipientsThisWeek.size} y esta campaña suma ${newRecipients}).`,
      });
    }
    if (
      effect.createsCampaign &&
      usage.newCampaignsThisWeek + 1 > config.maxNewCampaignsPerWeek!
    ) {
      blockers.push({
        code: 'WEEKLY_CAMPAIGNS_LIMIT',
        message: `Ya se usaron las ${config.maxNewCampaignsPerWeek} campañas nuevas de esta semana.`,
      });
    }
    const messagingBudget = config.messagingBudgetMonthly!;
    if (money(usage.messagingSpentMonth + messaging) > messagingBudget) {
      blockers.push({
        code: 'MESSAGING_BUDGET_EXCEEDED',
        message: `Supera el presupuesto de mensajería del mes (${currency} ${messagingBudget}; usado ${money(usage.messagingSpentMonth)}, esta campaña ${messaging}).`,
      });
    }
    if (effect.incentive && config.incentiveBudgetMonthly !== null) {
      if (
        money(usage.incentiveLiabilityMonth + incentives) >
        config.incentiveBudgetMonthly
      ) {
        blockers.push({
          code: 'INCENTIVE_BUDGET_EXCEEDED',
          message: `Supera el tope de incentivos del mes (${currency} ${config.incentiveBudgetMonthly}; comprometido ${money(usage.incentiveLiabilityMonth)}, esta campaña ${incentives}).`,
        });
      }
    }
    // Una campaña usa hasta su parte de CADA bolsa autorizada: un mensaje sin
    // premio no se achica por un presupuesto de incentivos que no usa.
    const share = campaignCaps(config);
    if (share.messaging !== null && messaging > share.messaging) {
      blockers.push({
        code: 'CAMPAIGN_SHARE_EXCEEDED',
        message: `Una sola campaña puede usar hasta el ${config.maxCampaignSharePercent}% del presupuesto de mensajería (${currency} ${share.messaging}); esta usa ${messaging}.`,
      });
    }
    if (
      effect.incentive &&
      share.incentives !== null &&
      incentives > share.incentives
    ) {
      blockers.push({
        code: 'CAMPAIGN_SHARE_EXCEEDED',
        message: `Una sola campaña puede usar hasta el ${config.maxCampaignSharePercent}% del presupuesto de incentivos (${currency} ${share.incentives}); esta compromete ${incentives}.`,
      });
    }
  }

  return {
    allowed: blockers.length === 0,
    blockers,
    excluded,
    eligibleCustomerIds: eligible,
    cost,
  };
}

/** Umbrales de pausa automática, sobre los últimos 7 días. */
export const AUTO_PAUSE = {
  windowDays: 7,
  minFailures: 5,
  failureRate: 0.2,
  minOptOuts: 3,
  optOutRate: 0.05,
  complaints: 2,
} as const;

export function autoPauseReason(metrics: {
  sent: number;
  failed: number;
  optOuts: number;
  complaints: number;
  contacted: number;
}): Exclude<PolicyPauseReason, 'MANUAL'> | null {
  if (metrics.complaints >= AUTO_PAUSE.complaints) return 'AUTO_COMPLAINTS';
  const attempts = metrics.sent + metrics.failed;
  if (
    metrics.failed >= AUTO_PAUSE.minFailures &&
    attempts > 0 &&
    metrics.failed / attempts >= AUTO_PAUSE.failureRate
  ) {
    return 'AUTO_SEND_ERRORS';
  }
  if (
    metrics.optOuts >= AUTO_PAUSE.minOptOuts &&
    metrics.optOuts / Math.max(metrics.contacted, 1) >= AUTO_PAUSE.optOutRate
  ) {
    return 'AUTO_OPT_OUTS';
  }
  return null;
}
