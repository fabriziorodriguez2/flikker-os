import type {
  ConsentAction,
  ConsentChannel,
  ConsentSource,
} from '@prisma/client';
import { effectiveConsent, type ConsentStatus } from './policy-rules';

/**
 * Auditoría de consentimiento de la base de clientes. Pura: recibe filas ya
 * leídas. Clasifica a cada cliente activo por lo que de verdad se puede
 * probar — tener teléfono, haber hecho check-in o no haberse dado de baja
 * NO es una autorización.
 */

const MS_PER_DAY = 86_400_000;

export interface AuditCustomerRow {
  id: string;
  hasPhone: boolean;
  hasEmail: boolean;
  optedOut: boolean;
  lastVisitAt: Date | null;
  linkedToMiFlikker: boolean;
}

export interface AuditEventRow {
  customerId: string;
  channel: ConsentChannel;
  action: ConsentAction;
  source: ConsentSource;
  createdAt: Date;
}

export interface ConsentAudit {
  customers: {
    active: number;
    withPhone: number;
    withEmail: number;
    linkedToMiFlikker: number;
  };
  whatsapp: {
    /** Con un sí documentado (origen, fecha y versión del texto). */
    granted: number;
    grantedBySource: Partial<Record<ConsentSource, number>>;
    /** Dijeron que no o se dieron de baja (incluye bajas anteriores al registro). */
    revoked: number;
    /** Pidieron no ser contactados nunca. */
    suppressed: number;
    /** Nunca respondieron: no se les puede escribir promociones. */
    neverAsked: number;
    /** De esos, vinieron en los últimos 30 días: se les pregunta en la próxima visita. */
    neverAskedVisitedLast30d: number;
    /** De esos, tienen Mi Flikker: pueden autorizarlo desde ahí. */
    neverAskedWithMiFlikker: number;
    /** Sin teléfono: no hay a dónde escribir. */
    noPhone: number;
  };
  email: {
    granted: number;
    revoked: number;
    neverAsked: number;
    noEmail: number;
  };
  /**
   * Evidencia de autorizaciones anteriores encontrada en Flikker. Hoy no
   * existe ningún registro previo: se importa con evidencia externa.
   */
  legacyEvidenceInFlikker: number;
}

export function buildConsentAudit(
  customers: AuditCustomerRow[],
  events: AuditEventRow[],
  now: Date,
): ConsentAudit {
  const eventsBy = new Map<string, AuditEventRow[]>();
  for (const e of events) {
    const list = eventsBy.get(e.customerId) ?? [];
    list.push(e);
    eventsBy.set(e.customerId, list);
  }
  const audit: ConsentAudit = {
    customers: { active: 0, withPhone: 0, withEmail: 0, linkedToMiFlikker: 0 },
    whatsapp: {
      granted: 0,
      grantedBySource: {},
      revoked: 0,
      suppressed: 0,
      neverAsked: 0,
      neverAskedVisitedLast30d: 0,
      neverAskedWithMiFlikker: 0,
      noPhone: 0,
    },
    email: { granted: 0, revoked: 0, neverAsked: 0, noEmail: 0 },
    legacyEvidenceInFlikker: 0,
  };
  const recent = now.getTime() - 30 * MS_PER_DAY;

  for (const c of customers) {
    audit.customers.active += 1;
    if (c.hasPhone) audit.customers.withPhone += 1;
    if (c.hasEmail) audit.customers.withEmail += 1;
    if (c.linkedToMiFlikker) audit.customers.linkedToMiFlikker += 1;
    const own = eventsBy.get(c.id) ?? [];

    const wa = own.filter((e) => e.channel === 'WHATSAPP');
    const waStatus: ConsentStatus = effectiveConsent(wa, c.optedOut);
    if (!c.hasPhone) {
      audit.whatsapp.noPhone += 1;
    } else if (waStatus === 'GRANTED') {
      audit.whatsapp.granted += 1;
      const lastGrant = [...wa]
        .filter((e) => e.action === 'GRANTED')
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      if (lastGrant) {
        audit.whatsapp.grantedBySource[lastGrant.source] =
          (audit.whatsapp.grantedBySource[lastGrant.source] ?? 0) + 1;
      }
    } else if (waStatus === 'SUPPRESSED') {
      audit.whatsapp.suppressed += 1;
    } else if (waStatus === 'REVOKED') {
      audit.whatsapp.revoked += 1;
    } else {
      audit.whatsapp.neverAsked += 1;
      if (c.lastVisitAt && c.lastVisitAt.getTime() >= recent) {
        audit.whatsapp.neverAskedVisitedLast30d += 1;
      }
      if (c.linkedToMiFlikker) audit.whatsapp.neverAskedWithMiFlikker += 1;
    }

    const em = own.filter((e) => e.channel === 'EMAIL');
    const emStatus = effectiveConsent(em, false);
    if (!c.hasEmail) audit.email.noEmail += 1;
    else if (emStatus === 'GRANTED') audit.email.granted += 1;
    else if (emStatus === 'REVOKED' || emStatus === 'SUPPRESSED')
      audit.email.revoked += 1;
    else audit.email.neverAsked += 1;
  }
  return audit;
}

// ---------------------------------------------------------------------------
// Importación de autorizaciones anteriores
// ---------------------------------------------------------------------------

/** Una autorización de hace más que esto ya no se considera vigente. */
export const LEGACY_MAX_AGE_MONTHS = 24;

export interface LegacyEvidence {
  /** Cómo se obtuvo: "planilla de mostrador firmada", "formulario web", ... */
  collectedVia: string;
  /** Dónde está la prueba: archivo, carpeta, sistema anterior. */
  documentRef: string;
  /** El texto que aceptó el cliente, tal cual. Define el alcance. */
  consentTextShown: string;
}

export type LegacyExclusion =
  | 'INVALID_PHONE'
  | 'CUSTOMER_NOT_FOUND'
  | 'INVALID_DATE'
  | 'FUTURE_DATE'
  | 'TOO_OLD'
  | 'ALREADY_GRANTED'
  | 'OPTED_OUT_OR_REVOKED'
  | 'SUPPRESSED'
  | 'DUPLICATE_ROW';

export const LEGACY_EXCLUSION_TEXT: Record<LegacyExclusion, string> = {
  INVALID_PHONE: 'Teléfono inválido.',
  CUSTOMER_NOT_FOUND: 'No es cliente activo de este comercio.',
  INVALID_DATE: 'Fecha de autorización inválida.',
  FUTURE_DATE: 'La fecha está en el futuro.',
  TOO_OLD: `La autorización tiene más de ${LEGACY_MAX_AGE_MONTHS} meses: hay que pedirla de nuevo.`,
  ALREADY_GRANTED: 'Ya tiene una autorización vigente en Flikker.',
  OPTED_OUT_OR_REVOKED:
    'Se dio de baja o dijo que no: una autorización vieja nunca pisa una baja.',
  SUPPRESSED: 'Pidió no ser contactado nunca.',
  DUPLICATE_ROW: 'Aparece más de una vez en el archivo.',
};

/** El texto aceptado tiene que cubrir promociones por el canal importado. */
export function evidenceCoversChannel(
  evidence: LegacyEvidence,
  channel: ConsentChannel,
): boolean {
  const text = evidence.consentTextShown.toLowerCase();
  const promotional =
    /promoci|ofert|benefici|novedad|descuent|marketing|publicidad/.test(text);
  const channelOk =
    channel === 'WHATSAPP'
      ? /whatsapp|mensaje/.test(text)
      : /e-?mail|correo/.test(text);
  return promotional && channelOk;
}

export function legacyGrantedAtProblem(
  grantedAt: Date,
  now: Date,
): LegacyExclusion | null {
  if (Number.isNaN(grantedAt.getTime())) return 'INVALID_DATE';
  if (grantedAt.getTime() > now.getTime()) return 'FUTURE_DATE';
  const limit = new Date(now);
  limit.setMonth(limit.getMonth() - LEGACY_MAX_AGE_MONTHS);
  if (grantedAt < limit) return 'TOO_OLD';
  return null;
}
