import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Benefit, BenefitType } from '@prisma/client';
import {
  BenefitsRepository,
  type BenefitData,
  type RetentionBridgeSnapshot,
} from './benefits.repository';
import { CreateBenefitDto } from './dto/create-benefit.dto';
import { UpdateBenefitDto } from './dto/update-benefit.dto';
import { UpdateBenefitRetentionBridgeDto } from './dto/update-benefit-retention-bridge.dto';

export interface LastDrawView {
  winnerName: string | null;
  winnerPhone: string | null;
  participantsCount: number;
  periodKey: string;
  drawnAt: Date;
}

export interface RetentionBridgeView {
  recoveryEnabled: boolean;
  rewardGoalEnabled: boolean;
  /**
   * True once the linked incentive has a percentage, fixed, or estimated
   * cost value — i.e. enabling "recuperación" would not need to ask for one.
   * False (including when there is no bridge yet) means the owner will be
   * asked for `estimatedCost` before recovery can be turned on.
   */
  hasKnownValue: boolean;
}

/** Piloto V2 — deny-by-default view for a Benefit with no bridge yet (legacy or brand new). */
const EMPTY_BRIDGE: RetentionBridgeView = {
  recoveryEnabled: false,
  rewardGoalEnabled: false,
  hasKnownValue: false,
};

function toBridgeView(
  definition: RetentionBridgeSnapshot | null | undefined,
): RetentionBridgeView {
  if (!definition) return EMPTY_BRIDGE;
  return {
    recoveryEnabled: definition.automationEligible,
    rewardGoalEnabled: definition.rewardGoalEligible,
    hasKnownValue:
      definition.percentageValue != null ||
      definition.fixedValue != null ||
      definition.estimatedCost != null,
  };
}

@Injectable()
export class BenefitsService {
  constructor(private readonly repository: BenefitsRepository) {}

  async list(businessId: string) {
    const benefits = await this.repository.findMany(businessId);
    return this.attachLastDraws(this.attachRetentionBridge(benefits));
  }

  getActive(businessId: string) {
    return this.repository.findActive(businessId);
  }

  async getOne(businessId: string, id: string) {
    const benefit = await this.repository.findOne(businessId, id);
    if (!benefit) throw new NotFoundException('Benefit not found');
    const [withBridge] = this.attachRetentionBridge([benefit]);
    const [withDraw] = await this.attachLastDraws([withBridge]);
    return withDraw;
  }

  /**
   * Piloto V2 — the single write path for "Usar para recuperar clientes" /
   * "Usar como recompensa por visitas" on a Benefit card. /dashboard/
   * beneficios is the only caller: Retention V2's own UI only ever lists and
   * authorizes what already exists (never creates).
   *
   * Ajuste #2 (pre-piloto) — REVERTIDO: hasta esta tanda, activar
   * "recuperación" sin ningún `percentageValue`/`fixedValue`/`estimatedCost`
   * conocido lanzaba `NEEDS_ESTIMATED_COST`. Pedido explícito: el costo NUNCA
   * es requisito para autorizar un beneficio — solo importa para estimar
   * economía (y, si el dueño más adelante quiere presupuestar por MONTO en
   * vez de por cantidad, ahí sí necesita configurarlo). Ver el mismo cambio,
   * misma razón, en `RetentionIncentivesService.validateConfiguration`.
   */
  async setRetentionBridge(
    businessId: string,
    benefitId: string,
    dto: UpdateBenefitRetentionBridgeDto,
  ): Promise<RetentionBridgeView> {
    const current = await this.repository.findRetentionBridge(
      businessId,
      benefitId,
    );
    if (!current) throw new NotFoundException('Benefit not found');

    const updated = await this.repository.setRetentionBridge(
      businessId,
      benefitId,
      {
        automationEligible: dto.recoveryEnabled,
        rewardGoalEligible: dto.rewardGoalEnabled,
        estimatedCost: dto.estimatedCost,
      },
    );
    return toBridgeView(updated);
  }

  async create(businessId: string, dto: CreateBenefitDto) {
    const dates = this.resolveDates(dto.startDate, dto.endDate);
    return this.repository.create(businessId, {
      type: dto.type,
      title: dto.title,
      description: dto.description,
      terms: dto.terms,
      recurrence: dto.recurrence,
      active: dto.active ?? false,
      ...dates,
    });
  }

  async update(businessId: string, id: string, dto: UpdateBenefitDto) {
    const data: Partial<BenefitData> = {};
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.terms !== undefined) data.terms = dto.terms;
    if (dto.recurrence !== undefined) data.recurrence = dto.recurrence;
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.startDate !== undefined || dto.endDate !== undefined) {
      Object.assign(data, this.resolveDates(dto.startDate, dto.endDate));
    }

    const updated = await this.repository.update(businessId, id, data);
    if (!updated) throw new NotFoundException('Benefit not found');
    return updated;
  }

  async activate(businessId: string, id: string) {
    const updated = await this.repository.setActive(businessId, id, true);
    if (!updated) throw new NotFoundException('Benefit not found');
    return updated;
  }

  async deactivate(businessId: string, id: string) {
    const updated = await this.repository.setActive(businessId, id, false);
    if (!updated) throw new NotFoundException('Benefit not found');
    return updated;
  }

  async remove(businessId: string, id: string) {
    const removed = await this.repository.remove(businessId, id);
    if (!removed) throw new NotFoundException('Benefit not found');
    return { ok: true };
  }

  async getParticipants(businessId: string, id: string) {
    // Ensure the benefit belongs to the tenant before listing participants.
    await this.getOne(businessId, id);
    return this.repository.findParticipants(businessId, id);
  }

  /**
   * Returns the business's active benefit, but only when it is currently valid:
   * type is not `none` and (if set) the current date is within its window.
   * Returns null otherwise so callers fall back to the legacy offer text.
   * Shared by the legacy QR capture flow and the new check-in flow.
   */
  async resolveActiveBenefit(
    businessId: string,
    now: Date = new Date(),
  ): Promise<Benefit | null> {
    const benefit = await this.repository.findActive(businessId);
    if (!benefit) return null;
    if (benefit.type === BenefitType.none) return null;
    if (benefit.startDate && benefit.startDate > now) return null;
    if (benefit.endDate && benefit.endDate < now) return null;
    return benefit;
  }

  /** A benefit that can be redeemed at the counter (has a code): not raffle/none. */
  isRedeemable(type: BenefitType): boolean {
    return type !== BenefitType.none && type !== BenefitType.raffle;
  }

  /** Ensures the customer holds a redemption code for the benefit. */
  ensureRedemptionCode(
    businessId: string,
    benefitId: string,
    customerId: string,
  ) {
    return this.repository.ensureRedemptionCode(
      businessId,
      benefitId,
      customerId,
    );
  }

  /** Reads the customer's redemption state for a benefit (code + redeemed). */
  findRedemption(businessId: string, benefitId: string, customerId: string) {
    return this.repository.findRedemption(businessId, benefitId, customerId);
  }

  /**
   * Records that a customer opts into a benefit (e.g. a raffle entry).
   * Used by the public QR flow; kept here so tenancy stays server-side.
   */
  registerParticipation(
    businessId: string,
    benefitId: string,
    customerId: string,
  ) {
    return this.repository.registerParticipation(
      businessId,
      benefitId,
      customerId,
    );
  }

  private resolveDates(
    startRaw?: string,
    endRaw?: string,
  ): Pick<BenefitData, 'startDate' | 'endDate'> {
    const startDate = startRaw ? new Date(startRaw) : null;
    const endDate = endRaw ? new Date(endRaw) : null;

    if (startDate && Number.isNaN(startDate.getTime())) {
      throw new BadRequestException('startDate is invalid');
    }
    if (endDate && Number.isNaN(endDate.getTime())) {
      throw new BadRequestException('endDate is invalid');
    }
    if (startDate && endDate && endDate.getTime() < startDate.getTime()) {
      throw new BadRequestException('endDate must be after startDate');
    }

    return { startDate, endDate };
  }

  /**
   * Replaces the raw `retentionIncentiveDefinition` relation (only present
   * because the repository includes it) with the small derived view the
   * frontend actually needs. Legacy benefits with no bridge yet get
   * `EMPTY_BRIDGE` — deny-by-default, satisfied by construction.
   */
  private attachRetentionBridge<
    T extends {
      retentionIncentiveDefinition?: RetentionBridgeSnapshot | null;
    },
  >(
    benefits: T[],
  ): (Omit<T, 'retentionIncentiveDefinition'> & {
    retentionBridge: RetentionBridgeView;
  })[] {
    return benefits.map(({ retentionIncentiveDefinition, ...rest }) => ({
      ...rest,
      retentionBridge: toBridgeView(retentionIncentiveDefinition),
    }));
  }

  /** Attaches `lastDraw` to raffle-type benefits; other types get `lastDraw: null`. */
  private async attachLastDraws<T extends { id: string; type: BenefitType }>(
    benefits: T[],
  ): Promise<(T & { lastDraw: LastDrawView | null })[]> {
    return Promise.all(
      benefits.map(async (benefit) => {
        if (benefit.type !== BenefitType.raffle) {
          return { ...benefit, lastDraw: null };
        }
        const draw = await this.repository.findLatestDraw(benefit.id);
        return {
          ...benefit,
          lastDraw: draw
            ? {
                winnerName: draw.winner?.name ?? null,
                winnerPhone: draw.winner?.phoneE164 ?? null,
                participantsCount: draw.participantsCount,
                periodKey: draw.periodKey,
                drawnAt: draw.drawnAt,
              }
            : null,
        };
      }),
    );
  }
}
