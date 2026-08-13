import { Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';
import { BenefitType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

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

  findMany(businessId: string) {
    return this.prisma.benefit.findMany({
      where: { businessId },
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

  findOne(businessId: string, id: string) {
    return this.prisma.benefit.findFirst({
      where: { id, businessId },
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
      const existing = await tx.benefit.findFirst({
        where: { id, businessId },
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
      const existing = await tx.benefit.findFirst({
        where: { id, businessId },
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

  async remove(businessId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      // Piloto V2 — deauthorize before deleting: the FK is `onDelete:
      // SetNull`, which only nulls the pointer, not the eligibility flags.
      // Without this, a deleted Benefit could leave an orphaned
      // RetentionIncentiveDefinition still automation/reward-eligible.
      await this.deauthorizeBridge(tx, id);
      const result = await tx.benefit.deleteMany({
        where: { id, businessId },
      });
      return result.count > 0;
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
   * Idempotent per open cycle: a customer participates at most once per
   * cycle. If their prior entry was already closed by a raffle draw, this
   * re-opens it for the new cycle instead of leaving them stuck out of it.
   */
  registerParticipation(
    businessId: string,
    benefitId: string,
    customerId: string,
  ) {
    return this.prisma.benefitParticipation.upsert({
      where: { benefitId_customerId: { benefitId, customerId } },
      create: { businessId, benefitId, customerId },
      update: { raffleDrawId: null, createdAt: new Date() },
    });
  }

  /**
   * Ensures the (benefit, customer) participation has a redemption code, issuing
   * one if missing. Idempotent: if a code already exists (even if redeemed) it is
   * returned unchanged. Retries on the rare code collision.
   */
  async ensureRedemptionCode(
    businessId: string,
    benefitId: string,
    customerId: string,
  ) {
    const existing = await this.prisma.benefitParticipation.findUnique({
      where: { benefitId_customerId: { benefitId, customerId } },
    });
    if (existing?.redemptionCode) return existing;

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        if (existing) {
          return await this.prisma.benefitParticipation.update({
            where: { id: existing.id },
            data: { redemptionCode: generateRedemptionCode() },
          });
        }
        return await this.prisma.benefitParticipation.create({
          data: {
            businessId,
            benefitId,
            customerId,
            redemptionCode: generateRedemptionCode(),
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

  findRedemption(businessId: string, benefitId: string, customerId: string) {
    return this.prisma.benefitParticipation.findFirst({
      where: { businessId, benefitId, customerId },
      select: { redemptionCode: true, redeemedAt: true },
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
        benefitTitle: found.benefit.title,
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
      benefitTitle: found.benefit.title,
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
