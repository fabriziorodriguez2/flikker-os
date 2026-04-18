import { randomBytes } from 'crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { WidgetStatus, WidgetType } from '@prisma/client';
import { WidgetsRepository } from './widgets.repository';
import { CreateWidgetDto } from './dto/create-widget.dto';
import { UpdateWidgetDto } from './dto/update-widget.dto';
import { UpdateWidgetStatusDto } from './dto/update-widget-status.dto';

const API_BASE_URL =
  process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;

@Injectable()
export class WidgetsService {
  constructor(private readonly widgetsRepository: WidgetsRepository) {}

  listForBusiness(businessId: string) {
    return this.widgetsRepository.findManyByBusiness(businessId);
  }

  async findOneScoped(businessId: string, widgetId: string) {
    const widget = await this.widgetsRepository.findOne(businessId, widgetId);
    if (!widget) throw new NotFoundException('Widget not found');
    return widget;
  }

  create(businessId: string, dto: CreateWidgetDto) {
    return this.widgetsRepository.create(businessId, {
      name: dto.name.trim(),
      type: dto.type,
      publicToken: randomBytes(16).toString('hex'),
      title: dto.title?.trim(),
      maxItems: dto.maxItems ?? 6,
      showAuthorName: dto.showAuthorName ?? true,
      showDate: dto.showDate ?? false,
    });
  }

  async update(businessId: string, widgetId: string, dto: UpdateWidgetDto) {
    await this.findOneScoped(businessId, widgetId);

    return this.widgetsRepository.update(businessId, widgetId, {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.title !== undefined ? { title: dto.title?.trim() ?? null } : {}),
      ...(dto.maxItems !== undefined ? { maxItems: dto.maxItems } : {}),
      ...(dto.showAuthorName !== undefined
        ? { showAuthorName: dto.showAuthorName }
        : {}),
      ...(dto.showDate !== undefined ? { showDate: dto.showDate } : {}),
    });
  }

  async updateStatus(
    businessId: string,
    widgetId: string,
    dto: UpdateWidgetStatusDto,
  ) {
    await this.findOneScoped(businessId, widgetId);

    if (dto.status === WidgetStatus.ACTIVE) {
      const highlightedCount =
        await this.widgetsRepository.countHighlightedReviews(businessId);

      if (highlightedCount === 0) {
        throw new BadRequestException(
          'Cannot activate a widget without highlighted reviews',
        );
      }
    }

    return this.widgetsRepository.updateStatus(businessId, widgetId, dto.status);
  }

  async getEmbedInfo(businessId: string, widgetId: string) {
    const widget = await this.findOneScoped(businessId, widgetId);

    return {
      widgetId: widget.id,
      publicToken: widget.publicToken,
      publicUrl: `${API_BASE_URL}/public/widgets/${widget.publicToken}`,
      embedType: 'feed',
    };
  }

  async getPublicWidget(publicToken: string) {
    const widget = await this.widgetsRepository.findActiveByPublicToken(
      publicToken,
    );
    if (!widget) throw new NotFoundException();

    const [aggregate, highlightedReviews] = await Promise.all([
      this.widgetsRepository.getHighlightedReviewsAggregate(widget.businessId),
      widget.type === WidgetType.BADGE
        ? Promise.resolve([])
        : this.widgetsRepository.findHighlightedReviewsForWidget(
            widget.businessId,
            widget.maxItems,
          ),
    ]);

    const averageRating = Number(aggregate._avg.rating ?? 0);
    const totalReviews = aggregate._count._all;

    return {
      widget: {
        type: widget.type,
        title: widget.title,
        showAuthorName: widget.showAuthorName,
        showDate: widget.showDate,
        maxItems: widget.maxItems,
      },
      summary: {
        averageRating,
        totalReviews,
        businessName: widget.business.name,
      },
      reviews: highlightedReviews.map((review) => ({
        rating: review.rating,
        content: review.content,
        authorDisplayName: widget.showAuthorName
          ? review.authorDisplayName
          : null,
        reviewedAt: widget.showDate ? review.reviewedAt : null,
      })),
    };
  }
}
