import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  WidgetEventType,
  WidgetMode,
  WidgetPosition,
  WidgetStatus,
  WidgetType,
} from '@prisma/client';
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
  mode: WidgetMode.toast,
  position: WidgetPosition.bottom_right,
  publicToken: PUBLIC_TOKEN,
  title: 'Trusted by customers',
  maxItems: 6,
  minStars: 4,
  maxReviewsShown: 6,
  primaryColor: '#5B5BD6',
  rotationSeconds: 30,
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
  countDetectedReviewsForWidget: jest.fn(),
  findHighlightedReviewsForWidget: jest.fn(),
  getHighlightedReviewsAggregate: jest.fn(),
  findActiveToastByBusinessId: jest.fn(),
  findDetectedReviewsForWidget: jest.fn(),
  getDetectedReviewsAggregate: jest.fn(),
  createEvent: jest.fn(),
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

  it('rejects activating a toast widget without eligible detected reviews', async () => {
    mockWidgetsRepository.findOne.mockResolvedValue(mockWidget);
    mockWidgetsRepository.countDetectedReviewsForWidget.mockResolvedValue(0);

    await expect(
      service.updateStatus(BUSINESS_ID, WIDGET_ID, {
        status: WidgetStatus.ACTIVE,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('activates a toast widget when eligible detected reviews exist', async () => {
    mockWidgetsRepository.findOne.mockResolvedValue(mockWidget);
    mockWidgetsRepository.countDetectedReviewsForWidget.mockResolvedValue(2);
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
      embedType: 'script',
      snippet: expect.stringContaining(`data-business="${BUSINESS_ID}"`),
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

  it('returns embeddable toast payload from detected Google reviews', async () => {
    mockWidgetsRepository.findActiveToastByBusinessId.mockResolvedValue({
      ...mockWidget,
      business: { id: BUSINESS_ID, name: 'Gains Montevideo' },
    });
    mockWidgetsRepository.getDetectedReviewsAggregate.mockResolvedValue({
      _avg: { stars: 4.8 },
      _count: { _all: 2 },
    });
    mockWidgetsRepository.findDetectedReviewsForWidget.mockResolvedValue([
      {
        googleReviewId: 'google-1',
        stars: 5,
        text: 'Excelente atencion',
        reviewerName: 'Maria',
        postedAt: new Date('2026-05-01T00:00:00.000Z'),
      },
    ]);

    const result = await service.getEmbeddableWidgetByBusiness(BUSINESS_ID);

    expect(result.widget.mode).toBe(WidgetMode.toast);
    expect(result.summary.totalReviews).toBe(2);
    expect(result.reviews).toEqual([
      {
        id: 'google-1',
        rating: 5,
        content: 'Excelente atencion',
        authorDisplayName: 'Maria',
        reviewedAt: new Date('2026-05-01T00:00:00.000Z'),
      },
    ]);
  });

  it('tracks public widget events', async () => {
    mockWidgetsRepository.createEvent.mockResolvedValue({ id: 'event-1' });

    await service.trackPublicEvent(BUSINESS_ID, {
      eventType: WidgetEventType.impression,
      googleReviewId: 'google-1',
      referrer: 'https://example.com',
    });

    expect(mockWidgetsRepository.createEvent).toHaveBeenCalledWith({
      businessId: BUSINESS_ID,
      eventType: WidgetEventType.impression,
      googleReviewId: 'google-1',
      referrer: 'https://example.com',
    });
  });
});
