import { randomBytes } from 'crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WidgetMode, WidgetStatus, WidgetType } from '@prisma/client';
import { WidgetsRepository } from './widgets.repository';
import { CreateWidgetDto } from './dto/create-widget.dto';
import { CreateWidgetEventDto } from './dto/create-widget-event.dto';
import { UpdateWidgetDto } from './dto/update-widget.dto';
import { UpdateWidgetStatusDto } from './dto/update-widget-status.dto';

const API_BASE_URL =
  process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
const WIDGET_BASE_URL =
  process.env.WIDGET_BASE_URL ??
  process.env.APP_PUBLIC_URL ??
  process.env.WEB_PUBLIC_URL ??
  API_BASE_URL;

type HighlightedWidgetReview = {
  rating: number;
  content: string | null;
  authorDisplayName: string | null;
  reviewedAt: Date;
};

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
      mode: dto.mode ?? WidgetMode.toast,
      position: dto.position,
      publicToken: randomBytes(16).toString('hex'),
      title: dto.title?.trim(),
      maxItems: dto.maxItems ?? 6,
      minStars: dto.minStars ?? 4,
      maxReviewsShown: dto.maxItems ?? 6,
      primaryColor: dto.primaryColor,
      rotationSeconds: dto.rotationSeconds ?? 9,
      showAuthorName: dto.showAuthorName ?? true,
      showDate: dto.showDate ?? false,
    });
  }

  async update(businessId: string, widgetId: string, dto: UpdateWidgetDto) {
    await this.findOneScoped(businessId, widgetId);

    return this.widgetsRepository.update(businessId, widgetId, {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.title !== undefined ? { title: dto.title?.trim() ?? null } : {}),
      ...(dto.mode !== undefined ? { mode: dto.mode } : {}),
      ...(dto.position !== undefined ? { position: dto.position } : {}),
      ...(dto.maxItems !== undefined ? { maxItems: dto.maxItems } : {}),
      ...(dto.maxItems !== undefined ? { maxReviewsShown: dto.maxItems } : {}),
      ...(dto.minStars !== undefined ? { minStars: dto.minStars } : {}),
      ...(dto.primaryColor !== undefined
        ? { primaryColor: dto.primaryColor }
        : {}),
      ...(dto.rotationSeconds !== undefined
        ? { rotationSeconds: dto.rotationSeconds }
        : {}),
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
    const widget = await this.findOneScoped(businessId, widgetId);

    if (dto.status === WidgetStatus.ACTIVE) {
      const availableReviews =
        await this.widgetsRepository.countDetectedReviewsForWidget(
          businessId,
          widget.minStars,
        );

      if (availableReviews === 0) {
        throw new BadRequestException(
          'Cannot activate a widget without eligible reviews',
        );
      }
    }

    return this.widgetsRepository.updateStatus(
      businessId,
      widgetId,
      dto.status,
    );
  }

  async getEmbedInfo(businessId: string, widgetId: string) {
    const widget = await this.findOneScoped(businessId, widgetId);

    return {
      widgetId: widget.id,
      publicToken: widget.publicToken,
      publicUrl: `${API_BASE_URL}/public/widgets/${widget.publicToken}`,
      embedType: 'script',
      snippet: this.buildSnippet(widget.businessId, widget.mode),
    };
  }

  async getToastPreviewReviews(businessId: string, minStars: number) {
    const safeMinStars = Number.isFinite(minStars)
      ? Math.min(5, Math.max(1, minStars))
      : 4;
    const [aggregate, reviews] = await Promise.all([
      this.widgetsRepository.getDetectedReviewsAggregate(
        businessId,
        safeMinStars,
      ),
      this.widgetsRepository.findDetectedReviewsForWidget(
        businessId,
        safeMinStars,
        6,
      ),
    ]);

    return {
      summary: {
        averageRating: Number(aggregate._avg.stars ?? 0),
        totalReviews: aggregate._count._all,
      },
      reviews: reviews.map((review) => ({
        id: review.googleReviewId,
        rating: review.stars,
        content: review.text,
        authorDisplayName: review.reviewerName,
        reviewedAt: review.postedAt,
      })),
    };
  }

  async getEmbeddableWidgetByBusiness(businessId: string, mode?: string) {
    const widget = await this.widgetsRepository.findActiveByMode(
      businessId,
      mode,
    );
    if (!widget) throw new NotFoundException();

    const [aggregate, reviews] = await Promise.all([
      this.widgetsRepository.getDetectedReviewsAggregate(
        businessId,
        widget.minStars,
      ),
      this.widgetsRepository.findDetectedReviewsForWidget(
        businessId,
        widget.minStars,
        widget.maxReviewsShown,
      ),
    ]);

    return {
      widget: {
        id: widget.id,
        mode: widget.mode,
        position: widget.position,
        title: widget.title,
        minStars: widget.minStars,
        primaryColor: widget.primaryColor ?? '#5B5BD6',
        rotationSeconds: widget.rotationSeconds,
        showAuthorName: widget.showAuthorName,
        showDate: widget.showDate,
      },
      summary: {
        averageRating: Number(aggregate._avg.stars ?? 0),
        totalReviews: aggregate._count._all,
        businessName: widget.business.name,
      },
      reviews: reviews.map((review) => ({
        id: review.googleReviewId,
        rating: review.stars,
        content: review.text,
        authorDisplayName: widget.showAuthorName ? review.reviewerName : null,
        reviewedAt: review.postedAt,
      })),
    };
  }

  trackPublicEvent(businessId: string, dto: CreateWidgetEventDto) {
    return this.widgetsRepository.createEvent({
      businessId,
      eventType: dto.eventType,
      googleReviewId: dto.googleReviewId ?? null,
      referrer: dto.referrer ?? null,
    });
  }

  async getPublicWidget(publicToken: string) {
    const widget =
      await this.widgetsRepository.findActiveByPublicToken(publicToken);
    if (!widget) throw new NotFoundException();

    const [aggregate, highlightedReviews] = await Promise.all([
      this.widgetsRepository.getHighlightedReviewsAggregate(widget.businessId),
      widget.type === WidgetType.BADGE
        ? Promise.resolve([] as HighlightedWidgetReview[])
        : (this.widgetsRepository.findHighlightedReviewsForWidget(
            widget.businessId,
            widget.maxItems,
          ) as Promise<HighlightedWidgetReview[]>),
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

  private buildSnippet(businessId: string, mode: string) {
    return `<script async src="${WIDGET_BASE_URL.replace(/\/$/, '')}/widget.js" data-business="${businessId}" data-mode="${mode}"></script>`;
  }
}
