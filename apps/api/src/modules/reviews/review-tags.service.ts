import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ReviewTagsRepository } from './review-tags.repository';
import { ReviewsRepository } from './reviews.repository';
import { CreateReviewTagDto } from './dto/create-review-tag.dto';
import { UpdateReviewTagDto } from './dto/update-review-tag.dto';

@Injectable()
export class ReviewTagsService {
  constructor(
    private readonly tagsRepository: ReviewTagsRepository,
    private readonly reviewsRepository: ReviewsRepository,
  ) {}

  static slugify(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  listForBusiness(businessId: string) {
    return this.tagsRepository.findAll(businessId);
  }

  async create(businessId: string, dto: CreateReviewTagDto) {
    const slug = ReviewTagsService.slugify(dto.name);

    const existing = await this.tagsRepository.findBySlug(businessId, slug);
    if (existing) {
      throw new ConflictException(
        `A tag with slug "${slug}" already exists in this business`,
      );
    }

    return this.tagsRepository.create(businessId, {
      name: dto.name,
      slug,
      color: dto.color,
    });
  }

  async update(businessId: string, tagId: string, dto: UpdateReviewTagDto) {
    const tag = await this.tagsRepository.findOne(businessId, tagId);
    if (!tag) throw new NotFoundException('Tag not found');

    const updateData: Record<string, string> = {};
    if (dto.color !== undefined) updateData.color = dto.color;

    if (dto.name !== undefined) {
      const slug = ReviewTagsService.slugify(dto.name);
      const existing = await this.tagsRepository.findBySlug(businessId, slug);
      if (existing && existing.id !== tagId) {
        throw new ConflictException(
          `A tag with slug "${slug}" already exists in this business`,
        );
      }
      updateData.name = dto.name;
      updateData.slug = slug;
    }

    return this.tagsRepository.update(businessId, tagId, updateData);
  }

  async delete(businessId: string, tagId: string) {
    const tag = await this.tagsRepository.findOne(businessId, tagId);
    if (!tag) throw new NotFoundException('Tag not found');

    await this.tagsRepository.delete(businessId, tagId);
  }

  async assignTag(businessId: string, reviewId: string, tagId: string) {
    // Validate review belongs to business
    const review = await this.reviewsRepository.findOne(businessId, reviewId);
    if (!review) throw new NotFoundException('Review not found');

    // Validate tag belongs to business
    const tag = await this.tagsRepository.findOne(businessId, tagId);
    if (!tag) {
      throw new BadRequestException('Tag does not belong to this business');
    }

    // Check if already assigned
    const existing = await this.tagsRepository.findRelation(
      businessId,
      reviewId,
      tagId,
    );
    if (existing) {
      throw new ConflictException('Tag is already assigned to this review');
    }

    const relation = await this.tagsRepository.assignTag(
      businessId,
      reviewId,
      tagId,
    );
    if (!relation) {
      throw new BadRequestException(
        'Review or tag does not belong to business',
      );
    }
    return relation;
  }

  async unassignTag(businessId: string, reviewId: string, tagId: string) {
    // Validate review belongs to business
    const review = await this.reviewsRepository.findOne(businessId, reviewId);
    if (!review) throw new NotFoundException('Review not found');

    await this.tagsRepository.unassignTag(businessId, reviewId, tagId);
  }
}
