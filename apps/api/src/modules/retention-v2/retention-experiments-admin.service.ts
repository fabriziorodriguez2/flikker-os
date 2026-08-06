import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Business,
  ExperienceVersion,
  RetentionExperimentStatus,
  RetentionStrategyType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { validateAllocation } from './allocation';
import { CreateRetentionExperimentDto } from './dto/create-retention-experiment.dto';
import { UpdateRetentionExperimentDto } from './dto/update-retention-experiment.dto';
import { CreateRetentionVariantDto } from './dto/create-retention-variant.dto';
import { UpdateRetentionVariantDto } from './dto/update-retention-variant.dto';

const INCENTIVE_STRATEGIES: RetentionStrategyType[] = [
  RetentionStrategyType.SOFT_BENEFIT,
  RetentionStrategyType.STRONG_BENEFIT,
];

/**
 * CRUD + lifecycle for experiments and their variants (Fase C.5 §4). Separate
 * from `RetentionExperimentService`, which is the hot-path runtime reader the
 * workers use — this is the owner-facing admin surface, and mixing the two
 * would put write validation on the same file as the per-customer recruitment
 * loop.
 *
 * The one rule that matters most: once an experiment leaves DRAFT, its
 * structure is frozen. Every RetentionAssignment already made snapshots its
 * own segment/visit facts, but the *variant set itself* is not snapshotted —
 * changing allocations or swapping an incentive after customers were already
 * bucketed would silently rewrite what "the REMINDER arm" means mid-experiment
 * and make the read unreproducible.
 */
@Injectable()
export class RetentionExperimentsAdminService {
  constructor(private readonly prisma: PrismaService) {}

  list(businessId: string) {
    return this.prisma.retentionExperiment.findMany({
      where: { businessId },
      include: { variants: { include: { incentiveDefinition: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOne(businessId: string, id: string) {
    const experiment = await this.prisma.retentionExperiment.findFirst({
      where: { businessId, id },
      include: { variants: { include: { incentiveDefinition: true } } },
    });
    if (!experiment) throw new NotFoundException('Experiment not found');
    return experiment;
  }

  create(businessId: string, dto: CreateRetentionExperimentDto) {
    return this.prisma.retentionExperiment.create({
      data: {
        businessId,
        name: dto.name,
        objective: dto.objective,
        segment: dto.segment ?? null,
      },
      include: { variants: true },
    });
  }

  async update(
    businessId: string,
    id: string,
    dto: UpdateRetentionExperimentDto,
  ) {
    const experiment = await this.requireDraft(businessId, id);
    return this.prisma.retentionExperiment.update({
      where: { id: experiment.id },
      data: dto,
      include: { variants: true },
    });
  }

  async addVariant(
    businessId: string,
    experimentId: string,
    dto: CreateRetentionVariantDto,
  ) {
    const experiment = await this.requireDraft(businessId, experimentId);
    await this.validateVariantIncentive(
      businessId,
      dto.strategyType,
      dto.incentiveDefinitionId,
    );

    return this.prisma.retentionVariant.create({
      data: {
        experimentId: experiment.id,
        businessId,
        name: dto.name,
        strategyType: dto.strategyType,
        incentiveDefinitionId: dto.incentiveDefinitionId ?? null,
        allocationPercent: dto.allocationPercent,
      },
    });
  }

  async updateVariant(
    businessId: string,
    experimentId: string,
    variantId: string,
    dto: UpdateRetentionVariantDto,
  ) {
    await this.requireDraft(businessId, experimentId);
    const variant = await this.prisma.retentionVariant.findFirst({
      where: { businessId, experimentId, id: variantId },
    });
    if (!variant) throw new NotFoundException('Variant not found');

    const nextStrategy = dto.strategyType ?? variant.strategyType;
    const nextIncentiveId =
      dto.incentiveDefinitionId !== undefined
        ? dto.incentiveDefinitionId
        : variant.incentiveDefinitionId;
    await this.validateVariantIncentive(
      businessId,
      nextStrategy,
      nextIncentiveId ?? undefined,
    );

    return this.prisma.retentionVariant.update({
      where: { id: variant.id },
      data: dto,
    });
  }

  /**
   * DRAFT or PAUSED → RUNNING, after the full Fase C.5 §4 checklist. Every
   * check is re-verified here, not trusted from creation time, because the
   * catalogue and the business's own flags can drift between configuring an
   * experiment and actually starting it.
   */
  async start(businessId: string, id: string) {
    const experiment = await this.getOne(businessId, id);
    if (
      experiment.status !== RetentionExperimentStatus.DRAFT &&
      experiment.status !== RetentionExperimentStatus.PAUSED
    ) {
      throw new ConflictException(
        `Cannot start an experiment in status ${experiment.status}`,
      );
    }

    const allocation = validateAllocation(experiment.variants);
    if (!allocation.valid) {
      throw new BadRequestException(allocation.errors.join('; '));
    }

    for (const variant of experiment.variants) {
      if (!variant.active) continue;
      if (!INCENTIVE_STRATEGIES.includes(variant.strategyType)) continue;

      const definition = variant.incentiveDefinition;
      if (!definition) {
        throw new BadRequestException(
          `Variant "${variant.name}" carries no incentive to offer`,
        );
      }
      if (!definition.active) {
        throw new BadRequestException(
          `Variant "${variant.name}" points to an inactive incentive`,
        );
      }
      if (!definition.automationEligible) {
        throw new BadRequestException(
          `Variant "${variant.name}"'s incentive is not authorized for automation`,
        );
      }
    }

    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { experienceVersion: true, retentionEngineV2Enabled: true },
    });
    this.requireEngineReady(business);

    return this.prisma.retentionExperiment.update({
      where: { id: experiment.id },
      data: { status: RetentionExperimentStatus.RUNNING, startAt: new Date() },
      include: { variants: true },
    });
  }

  async pause(businessId: string, id: string) {
    const experiment = await this.getOne(businessId, id);
    if (experiment.status !== RetentionExperimentStatus.RUNNING) {
      throw new ConflictException('Only a RUNNING experiment can be paused');
    }
    return this.prisma.retentionExperiment.update({
      where: { id: experiment.id },
      data: { status: RetentionExperimentStatus.PAUSED },
      include: { variants: true },
    });
  }

  async finish(businessId: string, id: string) {
    const experiment = await this.getOne(businessId, id);
    if (experiment.status === RetentionExperimentStatus.COMPLETED) {
      throw new ConflictException('Experiment is already COMPLETED');
    }
    return this.prisma.retentionExperiment.update({
      where: { id: experiment.id },
      data: { status: RetentionExperimentStatus.COMPLETED, endAt: new Date() },
      include: { variants: true },
    });
  }

  private async requireDraft(businessId: string, id: string) {
    const experiment = await this.getOne(businessId, id);
    if (experiment.status !== RetentionExperimentStatus.DRAFT) {
      throw new ConflictException(
        'This experiment already left DRAFT; its structure is frozen to keep existing assignments reproducible',
      );
    }
    return experiment;
  }

  private requireEngineReady(
    business: Pick<
      Business,
      'experienceVersion' | 'retentionEngineV2Enabled'
    > | null,
  ) {
    if (!business) throw new NotFoundException('Business not found');
    if (business.experienceVersion !== ExperienceVersion.CHECKIN_V2) {
      throw new BadRequestException(
        'This business is not on Check-in V2; Retention V2 cannot run',
      );
    }
    if (!business.retentionEngineV2Enabled) {
      throw new BadRequestException(
        'Retention Engine V2 is disabled for this business at the platform level',
      );
    }
  }

  private async validateVariantIncentive(
    businessId: string,
    strategyType: RetentionStrategyType,
    incentiveDefinitionId: string | undefined,
  ) {
    const carriesIncentive = INCENTIVE_STRATEGIES.includes(strategyType);

    if (!carriesIncentive) {
      if (incentiveDefinitionId) {
        throw new BadRequestException(
          `${strategyType} variants cannot carry an incentive`,
        );
      }
      return;
    }

    if (!incentiveDefinitionId) {
      throw new BadRequestException(
        `${strategyType} variants require an incentiveDefinitionId`,
      );
    }

    // Ownership check, not authorization — a variant may point at an incentive
    // that is not yet active/automation-eligible; that gate lives in `start`,
    // where the owner may have fixed it since the variant was created.
    const definition = await this.prisma.retentionIncentiveDefinition.findFirst(
      {
        where: { businessId, id: incentiveDefinitionId },
        select: { id: true },
      },
    );
    if (!definition) {
      throw new BadRequestException(
        'incentiveDefinitionId does not belong to this business',
      );
    }
  }
}
