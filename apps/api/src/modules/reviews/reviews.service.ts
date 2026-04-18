import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ReviewStatus } from '@prisma/client';
import { ReviewsRepository, ReviewFilters } from './reviews.repository';
import { CampaignsRepository } from '../campaigns/campaigns.repository';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { UpdateReviewStatusDto } from './dto/update-review-status.dto';

/** Allowed status transitions: from → [to, to, ...] */
const STATUS_TRANSITIONS: Record<ReviewStatus, ReviewStatus[]> = {
  [ReviewStatus.NEW]: [
    ReviewStatus.REVIEWED,
    ReviewStatus.RESPONDED,
    ReviewStatus.ARCHIVED,
  ],
  [ReviewStatus.REVIEWED]: [ReviewStatus.RESPONDED, ReviewStatus.ARCHIVED],
  [ReviewStatus.RESPONDED]: [ReviewStatus.REVIEWED, ReviewStatus.ARCHIVED],
  [ReviewStatus.ARCHIVED]: [ReviewStatus.NEW],
};

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    private readonly reviewsRepository: ReviewsRepository,
    private readonly campaignsRepository: CampaignsRepository,
  ) {}

  listForBusiness(businessId: string, filters: ReviewFilters) {
    return this.reviewsRepository.findMany(businessId, filters);
  }

  async findOneScoped(businessId: string, reviewId: string) {
    const review = await this.reviewsRepository.findOne(businessId, reviewId);
    if (!review) throw new NotFoundException('Review not found');
    return review;
  }

  async create(
    businessId: string,
    dto: CreateReviewDto,
    createdByUserId: string,
  ) {
    // Validate campaignId belongs to this business
    if (dto.campaignId) {
      await this.assertCampaignBelongsToBusiness(businessId, dto.campaignId);
    }

    const result = await this.reviewsRepository.createAtomic(
      businessId,
      { ...dto, createdByUserId },
    );

    if (result === 'DUPLICATE') {
      this.logger.warn(
        `Duplicate review blocked [${dto.source}/${dto.externalReviewId}] for business ${businessId}`,
      );
      throw new ConflictException(
        'A review with this source and externalReviewId already exists',
      );
    }

    this.logger.log(`Review created [${result.id}] for business ${businessId}`);
    return result;
  }

  async update(businessId: string, reviewId: string, dto: UpdateReviewDto) {
    const review = await this.findOneScoped(businessId, reviewId);

    if (review.status === ReviewStatus.ARCHIVED) {
      throw new BadRequestException(
        'Cannot edit an archived review. Unarchive it first.',
      );
    }

    // Validate campaignId if changing
    if (dto.campaignId) {
      await this.assertCampaignBelongsToBusiness(businessId, dto.campaignId);
    }

    return this.reviewsRepository.update(businessId, reviewId, dto);
  }

  async updateStatus(
    businessId: string,
    reviewId: string,
    dto: UpdateReviewStatusDto,
    changedByUserId?: string,
  ) {
    const review = await this.findOneScoped(businessId, reviewId);

    const allowed = STATUS_TRANSITIONS[review.status];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot transition from ${review.status} to ${dto.status}`,
      );
    }

    this.logger.log(
      `Review ${reviewId} status: ${review.status} → ${dto.status}`,
    );

    return this.reviewsRepository.updateStatus(
      businessId,
      reviewId,
      dto.status,
      changedByUserId,
      dto.reason,
    );
  }

  async highlight(businessId: string, reviewId: string) {
    await this.ensureEditable(businessId, reviewId);
    return this.reviewsRepository.update(businessId, reviewId, {
      isHighlighted: true,
    });
  }

  async unhighlight(businessId: string, reviewId: string) {
    await this.ensureEditable(businessId, reviewId);
    return this.reviewsRepository.update(businessId, reviewId, {
      isHighlighted: false,
    });
  }

  async markResponded(
    businessId: string,
    reviewId: string,
    respondedByUserId: string,
  ) {
    await this.ensureEditable(businessId, reviewId);
    return this.reviewsRepository.updateStatus(
      businessId,
      reviewId,
      ReviewStatus.RESPONDED,
      respondedByUserId,
    );
  }

  async markUnresponded(
    businessId: string,
    reviewId: string,
    changedByUserId?: string,
  ) {
    const review = await this.ensureEditable(businessId, reviewId);
    const fallbackStatus =
      review.status === ReviewStatus.ARCHIVED
        ? ReviewStatus.NEW
        : ReviewStatus.REVIEWED;

    return this.reviewsRepository.updateStatus(
      businessId,
      reviewId,
      fallbackStatus,
      changedByUserId,
    );
  }

  private async assertCampaignBelongsToBusiness(
    businessId: string,
    campaignId: string,
  ) {
    const campaign = await this.campaignsRepository.findOne(
      businessId,
      campaignId,
    );
    if (!campaign) {
      throw new BadRequestException(
        'Campaign does not belong to this business',
      );
    }
  }

  private async ensureEditable(businessId: string, reviewId: string) {
    const review = await this.findOneScoped(businessId, reviewId);
    if (review.status === ReviewStatus.ARCHIVED) {
      throw new BadRequestException(
        'Cannot modify an archived review. Unarchive it first.',
      );
    }
    return review;
  }
}
