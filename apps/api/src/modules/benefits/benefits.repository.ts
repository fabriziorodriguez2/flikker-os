import { Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';
import {
  BenefitIssuanceSource,
  BenefitType,
  Prisma,
  RewardGoalStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/// "Vivo" = todavía es una promesa pendiente de honrar. ACTIVE (tarjeta en
/// curso) y UNLOCKED (ganada, esperando que el cliente la retire) — los dos
/// casos donde el cliente cuenta con recibir exactamente lo que la tarjeta
/// dice hoy. REDEEMED/EXPIRED/CANCELLED ya son historia cerrada: no bloquean
/// para siempre la edición del catálogo actual.
const LIVE_REWARD_GOAL_STATUSES: RewardGoalStatus[] = [
  RewardGoalStatus.ACTIVE,
  RewardGoalStatus.UNLOCKED,
];

// Unambiguous alphabet for redemption codes (no 0/O/1/I/L) — easy to read/type.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

function generateRedemptionCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Ajuste "canje por URL" — `businessId` ya no es un filtro que el caller
 * decide (dejaba de funcionar si el empleado escaneaba un QR de un negocio
 * distinto al "activo" en su sesión); ahora `redemptionCode` es la única
 * clave de búsqueda (ya es `@unique` globalmente) y el `businessId` viaja
 * DENTRO del resultado — es `RedemptionService` quien lo usa para verificar
 * que el empleado logueado tiene membership ahí, cualquiera sea el status.
 */
export type ConsumeRedemptionResult =
  | { status: 'not_found' }
  | { status: 'already'; businessId: string }
  | { status: 'expired'; businessId: string }
  | {
      status: 'ok';
      businessId: string;
      participationId: string;
      benefitId: string;
      customerId: string;
      benefitTitle: string;
      benefitType: BenefitType;
      customerName: string;
    };

/**
 * Piloto V2 (#5) — read-only counterpart to `consumeRedemption`, for the
 * "scan → show confirmation card → Confirmar canje" flow. Never mutates
 * anything, so scanning (or re-scanning) a QR is always safe; only the
 * explicit confirm step calls `consumeRedemption`. Deliberately returns no
 * internal ids (`participationId`/`customerId`/`benefitId`) — just enough to
 * render "Beneficio: X / Cliente: Y" to the employee.
 */
export type PreviewRedemptionResult =
  | { status: 'not_found' }
  | { status: 'already'; businessId: string }
  | { status: 'expired'; businessId: string }
  | {
      status: 'ok';
      businessId: string;
      benefitTitle: string;
      customerName: string;
    };

export interface BenefitData {
  type: BenefitType;
  title: string;
  description?: string | null;
  terms?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  recurrence?: string | null;
  active?: boolean;
}

/** Raw shape of the linked catalogue row, as read alongside a Benefit. */
export interface RetentionBridgeSnapshot {
  id: string;
  automationEligible: boolean;
  rewardGoalEligible: boolean;
  percentageValue: number | null;
  fixedValue: Prisma.Decimal | null;
  estimatedCost: Prisma.Decimal | null;
}

const BRIDGE_SELECT = {
  select: {
    id: true,
    automationEligible: true,
    rewardGoalEligible: true,
    percentageValue: true,
    fixedValue: true,
    estimatedCost: true,
  },
} satisfies Prisma.RetentionIncentiveDefinitionDefaultArgs;

export interface RetentionBridgePatch {
  /** Undefined = leave as-is; true/false = set explicitly. */
  automationEligible?: boolean;
  rewardGoalEligible?: boolean;
  /** Only ever written when provided — never cleared implicitly. */
  estimatedCost?: number;
}

@Injectable()
export class BenefitsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * El catálogo del DUEÑO. Nunca incluye carriers internos: son filas que el
   * sistema crea para poder emitir una recompensa, no beneficios que él haya
   * creado. Aparecían como duplicados del premio y alguien terminaba
   * borrándolos, llevándose por cascade emisiones ya canjeadas.
   *
   * El filtro es por `isInternalCarrier`, NO por `active`: un beneficio
   * normal del dueño está inactivo la mayor parte del tiempo y tiene que
   * seguir viéndose exactamente igual que hasta ahora.
   */
  findMany(businessId: string) {
    return this.prisma.benefit.findMany({
      where: { businessId, isInternalCarrier: false },
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
      include: { retentionIncentiveDefinition: BRIDGE_SELECT },
    });
  }

  findActive(businessId: string) {
    return this.prisma.benefit.findFirst({
      where: { businessId, active: true },
    });
  }

  /** El beneficio elegido como regalo de bienvenida, si hay alguno. */
  findWelcomeBenefit(businessId: string) {
    return this.prisma.business.findUnique({
      where: { id: businessId },
      select: { welcomeBenefit: true },
    });
  }

  /** Fija (o limpia, con null) el regalo de bienvenida del negocio. */
  setWelcomeBenefit(businessId: string, benefitId: string | null) {
    return this.prisma.business.update({
      where: { id: businessId },
      data: { welcomeBenefitId: benefitId },
      select: { welcomeBenefitId: true },
    });
  }

  /**
   * Lectura administrable por el dueño — el chokepoint de detalle, edición,
   * activación, borrado y de los pickers de promoción/reactivación (todos
   * pasan por `BenefitsService.getOne`). Excluir acá los carriers internos
   * los vuelve inalcanzables por cualquiera de esos caminos con un solo
   * filtro, en vez de repetir el chequeo en cada endpoint.
   *
   * Devuelve `null` (que el service traduce a 404) y no un 403: para el
   * dueño ese id sencillamente no existe.
   */
  findOne(businessId: string, id: string) {
    return this.prisma.benefit.findFirst({
      where: { id, businessId, isInternalCarrier: false },
      include: { retentionIncentiveDefinition: BRIDGE_SELECT },
    });
  }

  async create(businessId: string, data: BenefitData) {
    const makeActive = data.active ?? false;
    return this.prisma.$transaction(async (tx) => {
      if (makeActive) await this.deactivateAll(tx, businessId);
      return tx.benefit.create({
        data: {
          businessId,
          type: data.type,
          title: data.title,
          description: data.description ?? null,
          terms: data.terms ?? null,
          startDate: data.startDate ?? null,
          endDate: data.endDate ?? null,
          recurrence: data.recurrence ?? null,
          active: makeActive,
        },
      });
    });
  }

  /** Scoped update. Returns null when the benefit does not belong to the tenant. */
  async update(businessId: string, id: string, data: Partial<BenefitData>) {
    return this.prisma.$transaction(async (tx) => {
      // Nunca un carrier interno: el dueño no puede editarlo ni activarlo.
      const existing = await tx.benefit.findFirst({
        where: { id, businessId, isInternalCarrier: false },
        select: { id: true },
      });
      if (!existing) return null;

      if (data.active === true) await this.deactivateAll(tx, businessId, id);
      // Piloto V2 (ajuste #2, revertido) — "active" ya NO desautoriza el
      // bridge. `active` solo decide qué se muestra como la promo actual del
      // check-in (el slot legacy de "un solo activo"); la elegibilidad para
      // recuperación/recompensa es una autorización independiente que el
      // dueño puede querer mantener en varios beneficios a la vez aunque
      // solo uno esté "activo". Deauthorize solo ocurre en `remove()` (borrado
      // real) — ver comentario ahí.

      return tx.benefit.update({ where: { id }, data });
    });
  }

  /** Activate/deactivate. Returns null when not found for the tenant. */
  async setActive(businessId: string, id: string, active: boolean) {
    return this.prisma.$transaction(async (tx) => {
      // Nunca un carrier interno: el dueño no puede editarlo ni activarlo.
      const existing = await tx.benefit.findFirst({
        where: { id, businessId, isInternalCarrier: false },
        select: { id: true },
      });
      if (!existing) return null;

      if (active) await this.deactivateAll(tx, businessId, id);
      // Piloto V2 (ajuste #2, revertido) — desactivar ya NO desautoriza el
      // bridge (ver el mismo comentario en `update()` arriba). Varios
      // beneficios pueden quedar autorizados para recuperación/recompensa
      // simultáneamente aunque solo uno esté "activo" en el slot del QR.

      return tx.benefit.update({ where: { id }, data: { active } });
    });
  }

  /**
   * Borrado FÍSICO — permitido solo si el beneficio nunca se emitió.
   *
   * `BenefitParticipation.benefit` es `onDelete: Cascade`, así que borrar un
   * Benefit con emisiones se lleva puestas sus participaciones. Eso es
   * pérdida de datos silenciosa en los dos casos posibles:
   *
   *   - emisión CANJEADA  → se destruye historial real (esto ya pasó en
   *     producción: la `CustomerRewardGoal` quedó en REDEEMED sin emisión y
   *     el KPI de Inicio dejó de contar un canje que sí ocurrió);
   *   - emisión PENDIENTE → se destruye un beneficio ya prometido a un
   *     cliente, que se queda con un código que de golpe no existe.
   *
   * Con emisiones, el beneficio se RETIRA en vez de borrarse: se desactiva
   * (deja de ofrecerse en el check-in) y se desautoriza el bridge (deja de
   * emitirse por recuperación/recompensa). El historial queda intacto.
   *
   * La guarda vive acá, en la aplicación, y no en el FK: cambiar el
   * `onDelete: Cascade` afectaría también el borrado legítimo de un negocio
   * entero, que sí tiene que arrastrar todo.
   */
  async remove(
    businessId: string,
    id: string,
  ): Promise<
    | { status: 'deleted' }
    | { status: 'not_found' }
    | { status: 'retired'; participations: number; redeemed: number }
  > {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.benefit.findFirst({
        where: { id, businessId, isInternalCarrier: false },
        select: { id: true },
      });
      if (!existing) return { status: 'not_found' as const };

      const [participations, redeemed] = await Promise.all([
        tx.benefitParticipation.count({ where: { benefitId: id, businessId } }),
        tx.benefitParticipation.count({
          where: { benefitId: id, businessId, redeemedAt: { not: null } },
        }),
      ]);

      // Piloto V2 — deauthorize antes de cualquiera de los dos caminos: el FK
      // del bridge es `onDelete: SetNull`, que anula el puntero pero no los
      // flags de elegibilidad. Sin esto, el beneficio podría dejar una
      // `RetentionIncentiveDefinition` huérfana todavía elegible.
      await this.deauthorizeBridge(tx, id);

      if (participations > 0) {
        await tx.benefit.update({
          where: { id },
          data: { active: false },
        });
        return { status: 'retired' as const, participations, redeemed };
      }

      const result = await tx.benefit.deleteMany({ where: { id, businessId } });
      return result.count > 0
        ? { status: 'deleted' as const }
        : { status: 'not_found' as const };
    });
  }

  /**
   * Forces off both eligibility flags on the RetentionIncentiveDefinition
   * bridged to this Benefit, if one exists. Never deletes or clears its
   * value fields — re-authorizing later (from Beneficios) should not need
   * the owner to re-enter the cost.
   */
  private deauthorizeBridge(tx: Prisma.TransactionClient, benefitId: string) {
    return tx.retentionIncentiveDefinition.updateMany({
      where: { benefitId },
      data: { automationEligible: false, rewardGoalEligible: false },
    });
  }

  /**
   * Reads the current bridge state for a Benefit without mutating anything.
   * Returns null if the Benefit itself does not belong to the tenant.
   */
  findRetentionBridge(businessId: string, benefitId: string) {
    return this.prisma.benefit.findFirst({
      where: { id: benefitId, businessId },
      select: {
        id: true,
        type: true,
        title: true,
        retentionIncentiveDefinition: BRIDGE_SELECT,
      },
    });
  }

  /**
   * Cuántos `CustomerRewardGoal` VIVOS (ver `LIVE_REWARD_GOAL_STATUSES`)
   * prometen esta definición hoy — "no cambiar una promesa que ya tiene un
   * cliente". Un REDEEMED/EXPIRED/CANCELLED viejo no cuenta: ya no hay nada
   * pendiente que ese cliente esté esperando recibir.
   *
   * `businessId` es cinturón y tirantes: `definitionId` ya llega tenant-
   * verificado (sale de `findRetentionBridge(businessId, ...)`, que solo
   * resuelve bridges del propio negocio), pero filtrar también acá evita que
   * un futuro caller que no pase por ese camino pueda, por error, contar
   * goals de otro negocio.
   */
  countLiveGoalsForDefinition(businessId: string, definitionId: string) {
    return this.prisma.customerRewardGoal.count({
      where: {
        businessId,
        incentiveDefinitionId: definitionId,
        status: { in: LIVE_REWARD_GOAL_STATUSES },
      },
    });
  }

  /**
   * Applies a patch to the RetentionIncentiveDefinition bridged to this
   * Benefit, lazily creating it (looked up by the unique `benefitId`, so it
   * can never be duplicated) the first time either flag is turned on. If
   * both flags are being turned off (or left off) and no bridge exists yet,
   * this is a no-op — no row is created just to sit inert.
   *
   * Business-rule validation (e.g. "needs an estimated cost") happens in the
   * service, before this is called — this only persists what it is given.
   */
  async setRetentionBridge(
    businessId: string,
    benefitId: string,
    patch: RetentionBridgePatch,
  ): Promise<RetentionBridgeSnapshot | null> {
    return this.prisma.$transaction(async (tx) => {
      const benefit = await tx.benefit.findFirst({
        where: { id: benefitId, businessId },
        select: { id: true, type: true, title: true },
      });
      if (!benefit) return null;

      const wantsToTurnSomethingOn =
        patch.automationEligible === true || patch.rewardGoalEligible === true;

      let definition = await tx.retentionIncentiveDefinition.findUnique({
        where: { benefitId },
        ...BRIDGE_SELECT,
      });

      if (!definition && wantsToTurnSomethingOn) {
        definition = await this.createBridgeDefinition(tx, businessId, benefit);
      }

      if (!definition) return null;

      const data: Prisma.RetentionIncentiveDefinitionUpdateInput = {};
      if (patch.automationEligible !== undefined) {
        data.automationEligible = patch.automationEligible;
      }
      if (patch.rewardGoalEligible !== undefined) {
        data.rewardGoalEligible = patch.rewardGoalEligible;
      }
      if (patch.estimatedCost !== undefined) {
        data.estimatedCost = patch.estimatedCost;
      }
      if (Object.keys(data).length === 0) return definition;

      return tx.retentionIncentiveDefinition.update({
        where: { id: definition.id },
        data,
        ...BRIDGE_SELECT,
      });
    });
  }

  /**
   * Creates the catalogue row for a Benefit's first-ever bridge activation.
   * `benefitId` is unique, so a collision here means another concurrent
   * request just created it — re-reading once is enough (single-owner UI,
   * not a hot path), same pattern as `ensureRedemptionCode` below.
   */
  private async createBridgeDefinition(
    tx: Prisma.TransactionClient,
    businessId: string,
    benefit: { id: string; type: BenefitType; title: string },
  ) {
    try {
      return await tx.retentionIncentiveDefinition.create({
        data: {
          businessId,
          benefitId: benefit.id,
          name: benefit.title,
          type: benefit.type,
          // Explicit, not relying on the column default: this is what makes
          // the row immediately findable by Retention V2's own incentives
          // list and by the Reward Goal engine's eligibility query (both
          // filter on `active: true`) as soon as either flag is turned on.
          active: true,
        },
        ...BRIDGE_SELECT,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await tx.retentionIncentiveDefinition.findUnique({
          where: { benefitId: benefit.id },
          ...BRIDGE_SELECT,
        });
        if (existing) return existing;
      }
      throw error;
    }
  }

  /** Only the currently open cycle — closed (already-drawn) entries are excluded. */
  findParticipants(businessId: string, benefitId: string) {
    return this.prisma.benefitParticipation.findMany({
      where: { benefitId, businessId, raffleDrawId: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        customer: {
          select: { id: true, name: true, phoneE164: true, email: true },
        },
      },
    });
  }

  /**
   * Sorteos: idempotente por ciclo abierto — un cliente participa como
   * máximo una vez por ciclo. Si su entrada anterior ya fue cerrada por un
   * sorteo, esto la reabre para el ciclo nuevo en vez de dejarlo afuera.
   * Los sorteos nunca fijan `redemptionCode`/`redeemedAt` (no son
   * "canjeables" — ver `isRedeemable`), así que reabrir la misma fila acá
   * nunca pisa un canje de nadie.
   *
   * Solo se usa para `source: RAFFLE`. Ya no depende de
   * `@@unique([benefitId, customerId])` (eliminado — un cliente puede
   * tener múltiples emisiones del mismo Benefit de otros orígenes al mismo
   * tiempo); el alcance "una fila por cliente" es una regla propia de este
   * método, no del modelo.
   */
  async registerParticipation(
    businessId: string,
    benefitId: string,
    customerId: string,
  ) {
    const benefit = await this.prisma.benefit.findUnique({
      where: { id: benefitId },
      select: { title: true },
    });

    const existing = await this.prisma.benefitParticipation.findFirst({
      where: {
        benefitId,
        customerId,
        source: BenefitIssuanceSource.RAFFLE,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!existing) {
      return this.prisma.benefitParticipation.create({
        data: {
          businessId,
          benefitId,
          customerId,
          source: BenefitIssuanceSource.RAFFLE,
          benefitTitleSnapshot: benefit?.title,
        },
      });
    }

    // Ciclo actual todavía abierto — reenviar no hace nada nuevo.
    if (existing.raffleDrawId === null) return existing;

    return this.prisma.benefitParticipation.update({
      where: { id: existing.id },
      data: {
        raffleDrawId: null,
        createdAt: new Date(),
        benefitTitleSnapshot: benefit?.title,
      },
    });
  }

  /**
   * Emite una participación NUEVA siempre — nunca reabre ni reusa una fila
   * existente, sin importar si el cliente ya tiene otras emisiones
   * (abiertas o canjeadas) del mismo Benefit. Pedido explícito: cada
   * entrega de Promociones es su propia emisión auditable, con su propio
   * código de canje — reenviar la misma promoción NO es idempotente a
   * propósito.
   *
   * `client` opcional (default `this.prisma`): el caller (Promociones) lo
   * usa para emitir TODO el lote de un envío dentro de una sola
   * `$transaction` — si el envío falla a mitad de camino, no queda un lote
   * a medio crear (emisiones huérfanas, nunca enviadas). Ver auditoría en
   * `notifications-promotions.service.ts#send`.
   */
  async issueBenefit(
    params: {
      businessId: string;
      benefitId: string;
      customerId: string;
      source: BenefitIssuanceSource;
      campaignId?: string | null;
    },
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    // Snapshot del título VIGENTE al momento de ESTA emisión — nunca una
    // referencia viva (ver el comentario del campo en schema.prisma).
    const benefit = await client.benefit.findUnique({
      where: { id: params.benefitId },
      select: { title: true },
    });

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await client.benefitParticipation.create({
          data: {
            businessId: params.businessId,
            benefitId: params.benefitId,
            customerId: params.customerId,
            source: params.source,
            campaignId: params.campaignId ?? null,
            redemptionCode: generateRedemptionCode(),
            benefitTitleSnapshot: benefit?.title,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          continue; // code collision → regenerate
        }
        throw error;
      }
    }
    throw new Error('Could not allocate a unique redemption code');
  }

  /**
   * Asegura una emisión ABIERTA (sin canjear) de este `source` para
   * (benefit, customer): si ya hay una vigente, la reusa — reenviar/releer
   * no invalida un código que el cliente ya puede tener a mano. Si la
   * última de ese origen ya se canjeó (o nunca hubo ninguna), emite una
   * nueva. Usado por WELCOME y CHECKIN_ACTIVE — los dos orígenes donde "la
   * misma promesa sigue vigente" tiene sentido reusar mientras esté
   * abierta, pero cada ciclo de canje es su propia fila para siempre.
   */
  async ensureRedemptionCode(
    businessId: string,
    benefitId: string,
    customerId: string,
    source: BenefitIssuanceSource,
  ) {
    const existing = await this.prisma.benefitParticipation.findFirst({
      where: { benefitId, customerId, source, redeemedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (existing?.redemptionCode) return existing;
    if (existing) {
      return this.prisma.benefitParticipation.update({
        where: { id: existing.id },
        data: { redemptionCode: generateRedemptionCode() },
      });
    }
    return this.issueBenefit({ businessId, benefitId, customerId, source });
  }

  /**
   * El estado de canje MÁS RECIENTE de este origen para (benefit,
   * customer). Con múltiples emisiones posibles por Benefit, "más
   * reciente" es lo correcto: es la misma que `ensureRedemptionCode`
   * reusaría si estuviera abierta, o la que se acaba de canjear si no.
   */
  findRedemption(
    businessId: string,
    benefitId: string,
    customerId: string,
    source: BenefitIssuanceSource,
  ) {
    return this.prisma.benefitParticipation.findFirst({
      where: { businessId, benefitId, customerId, source },
      select: { redemptionCode: true, redeemedAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Cualquier otra participación sin canjear que este cliente ya tenga —
   * típicamente otorgada por una promoción manual (Programa → Promociones
   * puede elegir cualquier Benefit del catálogo, no solo el `active` del
   * check-in). `BenefitParticipation` nunca dependió de `active`: es la
   * misma fila/mecanismo que ya usa el regalo de bienvenida y la recompensa
   * de tarjeta, solo que acá se lee para CUALQUIER benefit del negocio.
   * `excludeBenefitIds` evita listar dos veces algo que ya se muestra por
   * otro camino (el activo del check-in, el regalo de bienvenida).
   * También excluye participaciones vencidas (`expiresAt` en el pasado):
   * sin esto, un beneficio con vencimiento propio (Retention V2) seguía
   * apareciendo como "disponible" acá después de vencer.
   */
  findAvailableParticipations(
    businessId: string,
    customerId: string,
    excludeBenefitIds: string[],
    now: Date = new Date(),
  ) {
    return this.prisma.benefitParticipation.findMany({
      where: {
        businessId,
        customerId,
        redeemedAt: null,
        redemptionCode: { not: null },
        benefitId: { notIn: excludeBenefitIds },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: {
        id: true,
        benefitId: true,
        redemptionCode: true,
        expiresAt: true,
        benefitTitleSnapshot: true,
        benefit: {
          select: { type: true, title: true, description: true, terms: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Atomically consumes a redemption code. The double-canje guard is the
   * conditional `updateMany ... where redeemedAt IS NULL`: under concurrency the
   * row lock lets only one transaction flip it, so a code is redeemed at most
   * once. Runs in a transaction so the read + guarded update are consistent.
   *
   * Piloto V2 (#5) — now also enforces `expiresAt` (previously read but
   * never checked here: a code past its window redeemed the same as a valid
   * one). QR-flow benefits leave `expiresAt` null (no expiry, unchanged
   * behaviour); Retention V2/Reward-Goal-issued ones set it, and it is now
   * actually honored at redemption time — the "expiración corta razonable"
   * the QR canje flow needs is exactly this already-existing field.
   *
   * "Canje por URL" — ya no recibe `businessId`: `redemptionCode` es único
   * globalmente, así que la fila se busca solo por código. El caller
   * (`RedemptionService`) es quien decide, con el `businessId` que devuelve
   * el resultado, si el empleado logueado tiene permiso ahí — antes de eso
   * nunca se muta nada.
   */
  async consumeRedemption(
    code: string,
    userId: string,
    now: Date = new Date(),
  ): Promise<ConsumeRedemptionResult> {
    return this.prisma.$transaction(async (tx) => {
      const found = await tx.benefitParticipation.findFirst({
        where: { redemptionCode: code },
        include: {
          benefit: { select: { title: true, type: true } },
          customer: { select: { name: true } },
        },
      });
      if (!found) return { status: 'not_found' };
      if (found.redeemedAt)
        return { status: 'already', businessId: found.businessId };
      if (found.expiresAt && found.expiresAt < now) {
        return { status: 'expired', businessId: found.businessId };
      }

      const updated = await tx.benefitParticipation.updateMany({
        where: { id: found.id, redeemedAt: null },
        data: { redeemedAt: now, redeemedByUserId: userId },
      });
      if (updated.count === 0)
        return { status: 'already', businessId: found.businessId };

      return {
        status: 'ok',
        businessId: found.businessId,
        participationId: found.id,
        benefitId: found.benefitId,
        customerId: found.customerId,
        // Lo que se le prometió a este cliente cuando se le otorgó esta
        // participación — no el título actual del catálogo, que puede haber
        // cambiado desde entonces.
        benefitTitle: found.benefitTitleSnapshot ?? found.benefit.title,
        benefitType: found.benefit.type,
        customerName: found.customer.name,
      };
    });
  }

  /**
   * Read-only lookup for the "scan → preview → confirm" flow — see
   * `PreviewRedemptionResult`. Never mutates; the confirm step re-looks-up
   * by the same code via `consumeRedemption`, so there is no id to pass
   * forward and no window for the preview itself to go stale in a way that
   * matters (the atomic guard in `consumeRedemption` is what's authoritative).
   *
   * Sin `businessId`: mismo motivo que `consumeRedemption` — busca solo por
   * código (único globalmente) y devuelve el `businessId` en el resultado.
   */
  async previewRedemption(
    code: string,
    now: Date = new Date(),
  ): Promise<PreviewRedemptionResult> {
    const found = await this.prisma.benefitParticipation.findFirst({
      where: { redemptionCode: code },
      include: {
        benefit: { select: { title: true } },
        customer: { select: { name: true } },
      },
    });
    if (!found) return { status: 'not_found' };
    if (found.redeemedAt)
      return { status: 'already', businessId: found.businessId };
    if (found.expiresAt && found.expiresAt < now) {
      return { status: 'expired', businessId: found.businessId };
    }

    return {
      status: 'ok',
      businessId: found.businessId,
      benefitTitle: found.benefitTitleSnapshot ?? found.benefit.title,
      customerName: found.customer.name,
    };
  }

  attachRedeemedVisit(participationId: string, visitId: string) {
    return this.prisma.benefitParticipation.update({
      where: { id: participationId },
      data: { redeemedVisitId: visitId },
    });
  }

  /** Most recent draw for a benefit, with the winner's basic contact info. */
  findLatestDraw(benefitId: string) {
    return this.prisma.raffleDraw.findFirst({
      where: { benefitId },
      orderBy: { drawnAt: 'desc' },
      select: {
        id: true,
        periodKey: true,
        participantsCount: true,
        drawnAt: true,
        winner: { select: { name: true, phoneE164: true } },
      },
    });
  }

  /**
   * Semántica única de "Benefit canjeado" — pedido explícito tras el bug de
   * Inicio: una `BenefitParticipation` con `redeemedAt` seteado, sin
   * importar el origen (tarjeta de sellos, promoción, bienvenida,
   * reactivación, sorteo). Todo lugar que necesite este número (Inicio,
   * Insights, el funnel de Retención) pregunta ACÁ — nunca vuelve a leer
   * `CustomerRewardGoal.redeemedAt` por su cuenta. Ese campo sigue siendo la
   * promesa de ESA tarjeta puntual (se sincroniza con este en el mismo
   * instante — ver `RedemptionService.closeRewardGoalIfRedeemed`), pero la
   * fuente de verdad de "¿se canjeó un Benefit?" es siempre esta tabla.
   */
  countRedeemed(
    businessId: string,
    options: { from?: Date } = {},
  ): Promise<number> {
    return this.prisma.benefitParticipation.count({
      where: {
        businessId,
        redeemedAt: options.from ? { gte: options.from } : { not: null },
      },
    });
  }

  /** Canjes más recientes de cualquier origen — misma fuente que `countRedeemed`. */
  findRecentRedemptions(businessId: string, limit: number) {
    return this.prisma.benefitParticipation.findMany({
      where: { businessId, redeemedAt: { not: null } },
      orderBy: { redeemedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        redeemedAt: true,
        source: true,
        benefitTitleSnapshot: true,
        benefit: { select: { title: true } },
        customer: { select: { id: true, name: true } },
      },
    });
  }

  private deactivateAll(
    tx: Prisma.TransactionClient,
    businessId: string,
    exceptId?: string,
  ) {
    return tx.benefit.updateMany({
      where: {
        businessId,
        active: true,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      data: { active: false },
    });
  }
}
