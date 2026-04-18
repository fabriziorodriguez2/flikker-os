import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { WidgetStatus, WidgetType } from '@prisma/client';
import { WidgetsRepository } from './widgets.repository';
import { WidgetsService } from './widgets.service';

const BUSINESS_ID = 'biz-1';
const WIDGET_ID = 'widget-1';
const PUBLIC_TOKEN = 'public-token';

const mockWidget = {
  id: WIDGET_ID,
  businessId: BUSINESS_ID,
  name: 'Main badge',
  status: WidgetStatus.DRAFT,
  type: WidgetType.BADGE,
  publicToken: PUBLIC_TOKEN,
  title: 'Trusted by customers',
  maxItems: 6,
  showAuthorName: true,
  showDate: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockWidgetsRepository = {
  findManyByBusiness: jest.fn(),
  findOne: jest.fn(),
  findActiveByPublicToken: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  updateStatus: jest.fn(),
  countHighlightedReviews: jest.fn(),
  findHighlightedReviewsForWidget: jest.fn(),
  getHighlightedReviewsAggregate: jest.fn(),
};

describe('WidgetsService', () => {
  let service: WidgetsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WidgetsService,
        { provide: WidgetsRepository, useValue: mockWidgetsRepository },
      ],
    }).compile();

    service = module.get<WidgetsService>(WidgetsService);
  });

  it('lists widgets for a business', async () => {
    mockWidgetsRepository.findManyByBusiness.mockResolvedValue([mockWidget]);

    const result = await service.listForBusiness(BUSINESS_ID);

    expect(result).toEqual([mockWidget]);
    expect(mockWidgetsRepository.findManyByBusiness).toHaveBeenCalledWith(
      BUSINESS_ID,
    );
  });

  it('creates a widget with trimmed values and defaults', async () => {
    mockWidgetsRepository.create.mockResolvedValue(mockWidget);

    await service.create(BUSINESS_ID, {
      name: ' Main badge ',
      type: WidgetType.BADGE,
      title: ' Trusted by customers ',
    });

    expect(mockWidgetsRepository.create).toHaveBeenCalledWith(
      BUSINESS_ID,
      expect.objectContaining({
        name: 'Main badge',
        type: WidgetType.BADGE,
        title: 'Trusted by customers',
        maxItems: 6,
        showAuthorName: true,
        showDate: false,
        publicToken: expect.any(String),
      }),
    );
  });

  it('throws when widget is missing in tenant scope', async () => {
    mockWidgetsRepository.findOne.mockResolvedValue(null);

    await expect(service.findOneScoped(BUSINESS_ID, 'missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejects activating a widget without highlighted reviews', async () => {
    mockWidgetsRepository.findOne.mockResolvedValue(mockWidget);
    mockWidgetsRepository.countHighlightedReviews.mockResolvedValue(0);

    await expect(
      service.updateStatus(BUSINESS_ID, WIDGET_ID, {
        status: WidgetStatus.ACTIVE,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('activates a widget when highlighted reviews exist', async () => {
    mockWidgetsRepository.findOne.mockResolvedValue(mockWidget);
    mockWidgetsRepository.countHighlightedReviews.mockResolvedValue(2);
    mockWidgetsRepository.updateStatus.mockResolvedValue({
      ...mockWidget,
      status: WidgetStatus.ACTIVE,
    });

    const result = await service.updateStatus(BUSINESS_ID, WIDGET_ID, {
      status: WidgetStatus.ACTIVE,
    });

    expect(result.status).toBe(WidgetStatus.ACTIVE);
    expect(mockWidgetsRepository.updateStatus).toHaveBeenCalledWith(
      BUSINESS_ID,
      WIDGET_ID,
      WidgetStatus.ACTIVE,
    );
  });

  it('returns embed info for a scoped widget', async () => {
    mockWidgetsRepository.findOne.mockResolvedValue(mockWidget);

    const result = await service.getEmbedInfo(BUSINESS_ID, WIDGET_ID);

    expect(result).toEqual({
      widgetId: WIDGET_ID,
      publicToken: PUBLIC_TOKEN,
      publicUrl: expect.stringContaining(`/public/widgets/${PUBLIC_TOKEN}`),
      embedType: 'feed',
    });
  });

  it('returns sanitized public badge payload without reviews list', async () => {
    mockWidgetsRepository.findActiveByPublicToken.mockResolvedValue({
      ...mockWidget,
      business: { id: BUSINESS_ID, name: 'Gains Montevideo' },
    });
    mockWidgetsRepository.getHighlightedReviewsAggregate.mockResolvedValue({
      _avg: { rating: 4.5 },
      _count: { _all: 12 },
    });

    const result = await service.getPublicWidget(PUBLIC_TOKEN);

    expect(result).toEqual({
      widget: {
        type: WidgetType.BADGE,
        title: 'Trusted by customers',
        showAuthorName: true,
        showDate: false,
        maxItems: 6,
      },
      summary: {
        averageRating: 4.5,
        totalReviews: 12,
        businessName: 'Gains Montevideo',
      },
      reviews: [],
    });
    expect(
      mockWidgetsRepository.findHighlightedReviewsForWidget,
    ).not.toHaveBeenCalled();
  });

  it('returns public review widgets honoring author/date visibility', async () => {
    mockWidgetsRepository.findActiveByPublicToken.mockResolvedValue({
      ...mockWidget,
      type: WidgetType.REVIEW_LIST,
      showAuthorName: false,
      showDate: false,
      business: { id: BUSINESS_ID, name: 'Gains Montevideo' },
    });
    mockWidgetsRepository.getHighlightedReviewsAggregate.mockResolvedValue({
      _avg: { rating: 4.8 },
      _count: { _all: 3 },
    });
    mockWidgetsRepository.findHighlightedReviewsForWidget.mockResolvedValue([
      {
        rating: 5,
        content: 'Excelente atencion',
        authorDisplayName: 'Maria',
        reviewedAt: new Date('2026-04-01T00:00:00.000Z'),
      },
    ]);

    const result = await service.getPublicWidget(PUBLIC_TOKEN);

    expect(result.reviews).toEqual([
      {
        rating: 5,
        content: 'Excelente atencion',
        authorDisplayName: null,
        reviewedAt: null,
      },
    ]);
  });
});
