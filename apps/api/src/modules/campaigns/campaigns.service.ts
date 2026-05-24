import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { CampaignStatus } from '@prisma/client';
import { CampaignsRepository } from './campaigns.repository';
import { BranchesRepository } from '../branches/branches.repository';
import { PlansService } from '../plans/plans.service';
import { AuditService } from '../../common/services/audit.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { UpdateRepeatCampaignDto } from './dto/update-repeat-campaign.dto';
import { UpdateCampaignStatusDto } from './dto/update-campaign-status.dto';

/** Allowed status transitions: from → [to, to, ...] */
const STATUS_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  [CampaignStatus.DRAFT]: [CampaignStatus.ACTIVE, CampaignStatus.ARCHIVED],
  [CampaignStatus.ACTIVE]: [
    CampaignStatus.PAUSED,
    CampaignStatus.COMPLETED,
    CampaignStatus.ARCHIVED,
  ],
  [CampaignStatus.PAUSED]: [CampaignStatus.ACTIVE, CampaignStatus.ARCHIVED],
  [CampaignStatus.COMPLETED]: [CampaignStatus.ACTIVE, CampaignStatus.ARCHIVED],
  [CampaignStatus.ARCHIVED]: [CampaignStatus.DRAFT],
};

@Injectable()
export class CampaignsService {
  constructor(
    private readonly campaignsRepository: CampaignsRepository,
    private readonly branchesRepository: BranchesRepository,
    private readonly plansService: PlansService,
    private readonly auditService: AuditService,
  ) {}

  async listForBusiness(
    businessId: string,
    status: CampaignStatus | undefined,
    userId: string,
  ) {
    await this.campaignsRepository.ensureRepeatTemplates(businessId, userId);
    return this.campaignsRepository.findManyByBusiness(businessId, status);
  }

  async findOneScoped(businessId: string, campaignId: string) {
    const campaign = await this.campaignsRepository.findOne(
      businessId,
      campaignId,
    );
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  /**
   * Creates a campaign atomically: limit check + slug uniqueness + insert
   * all happen inside a single transaction to prevent TOCTOU races.
   */
  async create(
    businessId: string,
    dto: CreateCampaignDto,
    createdByUserId: string,
  ) {
    // Validate branchId belongs to this business
    if (dto.branchId) {
      await this.assertBranchBelongsToBusiness(businessId, dto.branchId);
    }

    // Validate date range
    if (dto.startsAt && dto.endsAt) {
      if (new Date(dto.endsAt) <= new Date(dto.startsAt)) {
        throw new BadRequestException('endsAt must be after startsAt');
      }
    }

    // Validate destinationUrl required for certain types
    if (
      (dto.destinationType === 'GOOGLE_REVIEW' ||
        dto.destinationType === 'CUSTOM_URL') &&
      !dto.destinationUrl
    ) {
      throw new BadRequestException(
        `destinationUrl is required when destinationType is ${dto.destinationType}`,
      );
    }

    const limits = await this.plansService.getLimits(businessId);

    const result = await this.campaignsRepository.createAtomic(
      businessId,
      { ...dto, createdByUserId },
      limits.maxCampaigns,
    );

    if (result === 'LIMIT_REACHED') {
      throw new ForbiddenException(
        `Campaign limit reached (${limits.maxCampaigns}). Upgrade your plan.`,
      );
    }
    if (result === 'SLUG_TAKEN') {
      throw new ConflictException(
        'Campaign slug already taken in this business',
      );
    }
    return result;
  }

  async update(
    businessId: string,
    campaignId: string,
    dto: UpdateCampaignDto,
    actorUserId?: string,
  ) {
    const campaign = await this.findOneScoped(businessId, campaignId);

    if (campaign.status === CampaignStatus.ARCHIVED) {
      throw new BadRequestException(
        'Cannot edit an archived campaign. Unarchive it first.',
      );
    }

    // Validate branchId belongs to this business
    if (dto.branchId) {
      await this.assertBranchBelongsToBusiness(businessId, dto.branchId);
    }

    // Validate date range (consider existing values)
    const effectiveStartsAt = dto.startsAt ?? campaign.startsAt?.toISOString();
    const effectiveEndsAt = dto.endsAt ?? campaign.endsAt?.toISOString();
    if (effectiveStartsAt && effectiveEndsAt) {
      if (new Date(effectiveEndsAt) <= new Date(effectiveStartsAt)) {
        throw new BadRequestException('endsAt must be after startsAt');
      }
    }

    const updated = await this.campaignsRepository.update(
      businessId,
      campaignId,
      dto,
    );

    if (actorUserId) {
      void this.auditService.log({
        action: 'CAMPAIGN_UPDATED',
        entityType: 'Campaign',
        entityId: campaignId,
        userId: actorUserId,
        businessId,
        metadata: {
          before: {
            name: campaign.name,
            description: campaign.description,
            destinationType: campaign.destinationType,
            destinationUrl: campaign.destinationUrl,
            enableLanding: campaign.enableLanding,
            branchId: campaign.branchId,
            startsAt: campaign.startsAt,
            endsAt: campaign.endsAt,
          },
          after: {
            name: updated.name,
            description: updated.description,
            destinationType: updated.destinationType,
            destinationUrl: updated.destinationUrl,
            enableLanding: updated.enableLanding,
            branchId: updated.branchId,
            startsAt: updated.startsAt,
            endsAt: updated.endsAt,
          },
        },
      });
    }

    return updated;
  }

  async updateRepeatSettings(
    businessId: string,
    campaignId: string,
    dto: UpdateRepeatCampaignDto,
    actorUserId?: string,
  ) {
    const campaign = await this.findOneScoped(businessId, campaignId);
    if (!campaign.templateKind) {
      throw new BadRequestException('Campaign is not a Repeat template');
    }

    const updated = await this.campaignsRepository.updateRepeatSettings(
      businessId,
      campaignId,
      {
        ...(dto.messageBody !== undefined
          ? { messageBody: dto.messageBody.trim() }
          : {}),
        ...(dto.triggerOffsetDays !== undefined
          ? { triggerOffsetDays: dto.triggerOffsetDays }
          : {}),
        ...(dto.reviewRequestDelayHours !== undefined
          ? { reviewRequestDelayHours: dto.reviewRequestDelayHours }
          : {}),
        ...(dto.offerText !== undefined
          ? { offerText: dto.offerText.trim() || null }
          : {}),
      },
    );

    if (!updated) throw new NotFoundException('Campaign not found');

    if (actorUserId) {
      void this.auditService.log({
        action: 'TEMPLATE_UPDATED',
        entityType: 'Campaign',
        entityId: campaignId,
        userId: actorUserId,
        businessId,
        metadata: {
          before: {
            messageBody: campaign.messageBody,
            triggerOffsetDays: campaign.triggerOffsetDays,
            offerText: campaign.offerText,
          },
          after: {
            messageBody: updated.messageBody,
            triggerOffsetDays: updated.triggerOffsetDays,
            offerText: updated.offerText,
          },
        },
      });
    }

    return updated;
  }

  getRecentActivity(businessId: string) {
    return this.campaignsRepository.findRecentActivity(businessId, 20);
  }

  async updateStatus(
    businessId: string,
    campaignId: string,
    dto: UpdateCampaignStatusDto,
  ) {
    const campaign = await this.findOneScoped(businessId, campaignId);

    const allowed = STATUS_TRANSITIONS[campaign.status];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot transition from ${campaign.status} to ${dto.status}`,
      );
    }

    return this.campaignsRepository.updateStatus(
      businessId,
      campaignId,
      dto.status,
    );
  }

  private async assertBranchBelongsToBusiness(
    businessId: string,
    branchId: string,
  ) {
    const branch = await this.branchesRepository.findOne(businessId, branchId);
    if (!branch) {
      throw new BadRequestException('Branch does not belong to this business');
    }
  }
}
