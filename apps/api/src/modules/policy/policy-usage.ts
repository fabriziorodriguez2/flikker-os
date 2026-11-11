import {
  BenefitIssuanceSource,
  MessageStatus,
  Prisma,
  PolicyReservationStatus,
} from '@prisma/client';
import {
  localPeriodKey,
  startOfLocalMonth,
  startOfLocalWeek,
  startOfNextLocalMonth,
} from '../../common/utils/timezone.util';
import { estimateIncentiveCost } from '../retention-v2/incentive-cost';
import {
  effectiveConsent,
  type ConsentStatus,
  type PolicyUsage,
} from './policy-rules';

/**
 * Lectura del uso. Lo ya materializado se cuenta desde sus propias tablas
 * (contactos de promociones, mensajes de Autopilot, emisiones de premios);
 * `PolicyReservation` solo suma lo que está EN VUELO (HELD y vigente). Así
 * una promoción confirmada no se cuenta dos veces: su reserva pasa a
 * COMMITTED y desde ahí la cuentan sus `ManualCampaignContact`.
 *
 * Funciones sueltas (sin DI) para poder correrlas con el cliente de una
 * transacción que ya tiene tomado el advisory lock del negocio.
 */

type Db = Prisma.TransactionClient;

const MS_PER_DAY = 86_400_000;

/** Contactos que cuentan como "promoción" para frecuencia y semana. */
const LIVE_CONTACT_STATUSES = ['pending', 'sent'];
const LIVE_MESSAGE_STATUSES: MessageStatus[] = [
  MessageStatus.queued,
  MessageStatus.sending,
  MessageStatus.sent,
  MessageStatus.delivered,
  MessageStatus.read,
];
const SENT_MESSAGE_STATUSES: MessageStatus[] = [
  MessageStatus.sent,
  MessageStatus.delivered,
  MessageStatus.read,
];

export function weekKey(now: Date, timezone: string): string {
  const start = startOfLocalWeek(now, timezone);
  return `W${start.toISOString().slice(0, 10)}`;
}

export function monthKey(now: Date, timezone: string): string {
  return localPeriodKey(now, timezone);
}

function heldWhere(businessId: string, now: Date) {
  return {
    businessId,
    status: PolicyReservationStatus.HELD,
    expiresAt: { gt: now },
  };
}

/** Mensajes de marketing enviados en el mes local (promociones + Autopilot). */
export async function marketingMessagesSentThisMonth(
  db: Db,
  businessId: string,
  timezone: string,
  now: Date,
): Promise<number> {
  const from = startOfLocalMonth(now, timezone);
  const to = startOfNextLocalMonth(now, timezone);
  const [contacts, retention] = await Promise.all([
    db.manualCampaignContact.count({
      where: { businessId, status: 'sent', sentAt: { gte: from, lt: to } },
    }),
    db.message.count({
      where: {
        businessId,
        status: { in: SENT_MESSAGE_STATUSES },
        sentAt: { gte: from, lt: to },
        retentionAssignment: { isNot: null },
      },
    }),
  ]);
  return contacts + retention;
}

/**
 * Responsabilidad económica de premios del mes: emisiones de promociones (y,
 * si `includeReactivation`, de Autopilot) que ya se canjearon o que todavía
 * se pueden canjear. Una emisión vencida sin canjear deja de contar: esa es
 * la caducidad. Costo por emisión con la misma estimación que Autopilot;
 * las que no tienen costo estimable se informan aparte, nunca se inventan.
 */
export async function incentiveLiabilityThisMonth(
  db: Db,
  params: {
    businessId: string;
    timezone: string;
    now: Date;
    averageTicketAmount: Prisma.Decimal | number | null;
    includeReactivation: boolean;
  },
): Promise<{ cost: number; count: number; unknownCost: number }> {
  const { businessId, timezone, now } = params;
  const from = startOfLocalMonth(now, timezone);
  const to = startOfNextLocalMonth(now, timezone);
  const sources: BenefitIssuanceSource[] = params.includeReactivation
    ? [BenefitIssuanceSource.PROMOTION, BenefitIssuanceSource.REACTIVATION]
    : [BenefitIssuanceSource.PROMOTION];
  const definitionSelect = {
    estimatedCost: true,
    percentageValue: true,
    fixedValue: true,
  } as const;
  const rows = await db.benefitParticipation.findMany({
    where: {
      businessId,
      source: { in: sources },
      createdAt: { gte: from, lt: to },
      // Canjeada, o todavía canjeable. Con OR explícito y no un NOT: en SQL
      // `NOT (expires_at <= now)` con expires_at NULL da NULL y dejaría
      // afuera justo las emisiones que no vencen.
      OR: [
        { redeemedAt: { not: null } },
        { expiresAt: null },
        { expiresAt: { gt: now } },
      ],
    },
    select: {
      benefit: {
        select: { retentionIncentiveDefinition: { select: definitionSelect } },
      },
      retentionAssignment: {
        select: {
          variant: {
            select: { incentiveDefinition: { select: definitionSelect } },
          },
        },
      },
    },
  });
  let cost = 0;
  let unknownCost = 0;
  for (const row of rows) {
    const definition =
      row.retentionAssignment?.variant.incentiveDefinition ??
      row.benefit.retentionIncentiveDefinition;
    const estimate = definition
      ? estimateIncentiveCost(definition, params.averageTicketAmount)
      : null;
    if (estimate) cost += estimate.cost;
    else unknownCost += 1;
  }
  return { cost, count: rows.length, unknownCost };
}

/** Lo reservado y todavía en vuelo para el mes actual. */
export async function heldAmounts(
  db: Db,
  businessId: string,
  timezone: string,
  now: Date,
): Promise<{ messaging: number; incentives: number }> {
  const agg = await db.policyReservation.aggregate({
    where: { ...heldWhere(businessId, now), monthKey: monthKey(now, timezone) },
    _sum: { messagingAmount: true, incentiveAmount: true },
  });
  return {
    messaging: Number(agg._sum.messagingAmount ?? 0),
    incentives: Number(agg._sum.incentiveAmount ?? 0),
  };
}

/** Estado de WhatsApp de un grupo de clientes, con el espejo `optedOut`. */
export async function whatsappConsent(
  db: Db,
  businessId: string,
  customerIds: string[],
): Promise<Map<string, ConsentStatus>> {
  const result = new Map<string, ConsentStatus>();
  if (customerIds.length === 0) return result;
  const [customers, events] = await Promise.all([
    db.customer.findMany({
      where: { businessId, id: { in: customerIds } },
      select: { id: true, optedOut: true, isActive: true },
    }),
    db.customerConsentEvent.findMany({
      where: {
        businessId,
        customerId: { in: customerIds },
        channel: 'WHATSAPP',
      },
      select: { customerId: true, action: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  const byCustomer = new Map<string, typeof events>();
  for (const event of events) {
    const list = byCustomer.get(event.customerId) ?? [];
    list.push(event);
    byCustomer.set(event.customerId, list);
  }
  for (const customer of customers) {
    result.set(
      customer.id,
      customer.isActive
        ? effectiveConsent(byCustomer.get(customer.id) ?? [], customer.optedOut)
        : 'REVOKED',
    );
  }
  return result;
}

/**
 * Todo lo que necesita `evaluatePolicy` para un efecto sobre `candidates`.
 * `excludeMessageId`: el mensaje de Autopilot que se está despachando, que
 * ya existe como fila y no debe contarse contra sí mismo.
 */
export async function loadUsage(
  db: Db,
  params: {
    businessId: string;
    timezone: string;
    now: Date;
    candidates: string[];
    messageUnitCost: number | null;
    averageTicketAmount: Prisma.Decimal | number | null;
    excludeMessageId?: string;
  },
): Promise<PolicyUsage> {
  const { businessId, timezone, now, candidates } = params;
  const weekStart = startOfLocalWeek(now, timezone);
  const since30 = new Date(now.getTime() - 30 * MS_PER_DAY);
  const excludeMessage = params.excludeMessageId
    ? { id: { not: params.excludeMessageId } }
    : {};

  const [
    sentThisMonth,
    liability,
    held,
    weekContacts,
    weekMessages,
    heldReservations,
    campaignsThisWeek,
    candidateContacts,
    candidateMessages,
    consent,
  ] = await Promise.all([
    marketingMessagesSentThisMonth(db, businessId, timezone, now),
    incentiveLiabilityThisMonth(db, {
      businessId,
      timezone,
      now,
      averageTicketAmount: params.averageTicketAmount,
      includeReactivation: true,
    }),
    heldAmounts(db, businessId, timezone, now),
    db.manualCampaignContact.findMany({
      where: {
        businessId,
        status: { in: LIVE_CONTACT_STATUSES },
        createdAt: { gte: weekStart },
        customerId: { not: null },
      },
      select: { customerId: true },
      distinct: ['customerId'],
    }),
    db.message.findMany({
      where: {
        businessId,
        status: { in: LIVE_MESSAGE_STATUSES },
        createdAt: { gte: weekStart },
        retentionAssignment: { isNot: null },
        ...excludeMessage,
      },
      select: { customerId: true },
      distinct: ['customerId'],
    }),
    db.policyReservation.findMany({
      where: heldWhere(businessId, now),
      select: {
        customerIds: true,
        createsCampaign: true,
        weekKey: true,
        createdAt: true,
        source: true,
      },
    }),
    // Campañas nuevas de la semana: promociones manuales y corridas del
    // modo autónomo de Intelligence que reclutaron de verdad (PILOT).
    Promise.all([
      db.manualCampaign.count({
        where: { businessId, createdAt: { gte: weekStart } },
      }),
      db.autonomousRun.count({
        where: {
          businessId,
          mode: 'PILOT',
          status: 'EXECUTED',
          createdAt: { gte: weekStart },
        },
      }),
    ]).then(([manual, autonomous]) => manual + autonomous),
    candidates.length
      ? db.manualCampaignContact.findMany({
          where: {
            businessId,
            customerId: { in: candidates },
            status: { in: LIVE_CONTACT_STATUSES },
            createdAt: { gte: since30 },
          },
          select: { customerId: true, sentAt: true, createdAt: true },
        })
      : Promise.resolve([]),
    candidates.length
      ? db.message.findMany({
          where: {
            businessId,
            customerId: { in: candidates },
            status: { in: LIVE_MESSAGE_STATUSES },
            createdAt: { gte: since30 },
            retentionAssignment: { isNot: null },
            ...excludeMessage,
          },
          select: { customerId: true, sentAt: true, createdAt: true },
        })
      : Promise.resolve([]),
    whatsappConsent(db, businessId, candidates),
  ]);

  const currentWeek = weekKey(now, timezone);
  const recipientsThisWeek = new Set<string>();
  for (const row of weekContacts) {
    if (row.customerId) recipientsThisWeek.add(row.customerId);
  }
  for (const row of weekMessages) recipientsThisWeek.add(row.customerId);

  // Las reservas de Autopilot cubren un mensaje que ya existe como fila
  // (y ya se contó arriba): solo suman las de promociones e Intelligence.
  const contactReservations = heldReservations.filter(
    (r) => r.source !== 'AUTOPILOT',
  );
  let heldCampaigns = 0;
  for (const reservation of contactReservations) {
    if (reservation.weekKey === currentWeek) {
      for (const id of reservation.customerIds) recipientsThisWeek.add(id);
      if (reservation.createsCampaign) heldCampaigns += 1;
    }
  }

  const contactsByCustomer = new Map<string, Date[]>();
  const push = (customerId: string | null, at: Date) => {
    if (!customerId) return;
    const list = contactsByCustomer.get(customerId) ?? [];
    list.push(at);
    contactsByCustomer.set(customerId, list);
  };
  for (const row of candidateContacts)
    push(row.customerId, row.sentAt ?? row.createdAt);
  for (const row of candidateMessages)
    push(row.customerId, row.sentAt ?? row.createdAt);
  const candidateSet = new Set(candidates);
  for (const reservation of contactReservations) {
    for (const id of reservation.customerIds) {
      if (candidateSet.has(id)) push(id, reservation.createdAt);
    }
  }

  return {
    messagingSpentMonth:
      sentThisMonth * (params.messageUnitCost ?? 0) + held.messaging,
    incentiveLiabilityMonth: liability.cost + held.incentives,
    recipientsThisWeek,
    newCampaignsThisWeek: campaignsThisWeek + heldCampaigns,
    contactsByCustomer,
    consentByCustomer: consent,
  };
}

/** Lo que una promoción en vuelo ya comprometió del tope de incentivos (para Autopilot). */
export async function promotionIncentiveLiability(
  db: Db,
  params: {
    businessId: string;
    timezone: string;
    now: Date;
    averageTicketAmount: Prisma.Decimal | number | null;
  },
): Promise<number> {
  const [issued, held] = await Promise.all([
    incentiveLiabilityThisMonth(db, { ...params, includeReactivation: false }),
    heldAmounts(db, params.businessId, params.timezone, params.now),
  ]);
  return issued.cost + held.incentives;
}

/**
 * Costo estimado de entregar UN beneficio del catálogo, con la definición
 * de incentivo que el dueño ya cargó para ese beneficio (la misma que usa
 * Autopilot). `null` = premio por destinatario sin costo estimable (bloquea);
 * `{ incentive: null }` = no hay premio por destinatario (sorteo, ninguno).
 */
export async function benefitIncentive(
  db: Db,
  businessId: string,
  benefitId: string,
  averageTicketAmount: Prisma.Decimal | number | null,
): Promise<{ incentive: { unitCost: number | null } | null } | null> {
  const benefit = await db.benefit.findFirst({
    where: { id: benefitId, businessId, isInternalCarrier: false },
    select: {
      type: true,
      retentionIncentiveDefinition: {
        select: {
          estimatedCost: true,
          percentageValue: true,
          fixedValue: true,
        },
      },
    },
  });
  if (!benefit) return null;
  if (benefit.type === 'none' || benefit.type === 'raffle') {
    return { incentive: null };
  }
  const estimate = benefit.retentionIncentiveDefinition
    ? estimateIncentiveCost(
        benefit.retentionIncentiveDefinition,
        averageTicketAmount,
      )
    : null;
  return { incentive: { unitCost: estimate ? estimate.cost : null } };
}
