import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ReviewStatus } from '@prisma/client';
import { ReviewsRepository } from '../reviews/reviews.repository';
import { ResponsesRepository } from './responses.repository';
import { CreateResponseDto } from './dto/create-response.dto';
import { UpdateResponseDto } from './dto/update-response.dto';

@Injectable()
export class ResponsesService {
  constructor(
    private readonly responsesRepository: ResponsesRepository,
    private readonly reviewsRepository: ReviewsRepository,
  ) {}

  async findByReview(businessId: string, reviewId: string) {
    const review = await this.reviewsRepository.findOne(businessId, reviewId);
    if (!review) throw new NotFoundException('Review not found');

    const response = await this.responsesRepository.findByReview(
      businessId,
      reviewId,
    );

    if (!response) throw new NotFoundException('Response not found');
    return response;
  }

  async create(
    businessId: string,
    dto: CreateResponseDto,
    respondedByUserId: string,
  ) {
    const review = await this.reviewsRepository.findOne(businessId, dto.reviewId);
    if (!review) throw new NotFoundException('Review not found');
    if (review.status === ReviewStatus.ARCHIVED) {
      throw new BadRequestException(
        'Cannot respond to an archived review. Unarchive it first.',
      );
    }

    const existing = await this.responsesRepository.findByReview(
      businessId,
      dto.reviewId,
    );
    if (existing) {
      throw new ConflictException('A response already exists for this review');
    }

    return this.responsesRepository.create(
      businessId,
      dto.reviewId,
      dto.content.trim(),
      respondedByUserId,
    );
  }

  async update(
    businessId: string,
    responseId: string,
    dto: UpdateResponseDto,
    respondedByUserId: string,
  ) {
    const response = await this.responsesRepository.findOne(
      businessId,
      responseId,
    );
    if (!response) throw new NotFoundException('Response not found');

    const review = await this.reviewsRepository.findOne(
      businessId,
      response.review.id,
    );
    if (!review) throw new NotFoundException('Review not found');
    if (review.status === ReviewStatus.ARCHIVED) {
      throw new BadRequestException(
        'Cannot update the response of an archived review.',
      );
    }

    return this.responsesRepository.update(
      businessId,
      responseId,
      dto.content.trim(),
      respondedByUserId,
    );
  }
}
