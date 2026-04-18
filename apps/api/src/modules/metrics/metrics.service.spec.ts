import { Test, TestingModule } from '@nestjs/testing';
import { CampaignStatus, WidgetStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MetricsService } from './metrics.service';

const BUSINESS_ID = 'biz-1';

const mockPrisma = {
  review: {
    count: jest.fn(),
    aggregate: jest.fn(),
    findMany: jest.fn(),
  },
  campaign: {
    count: jest.fn(),
  },
  scanEvent: {
    count: jest.fn(),
  },
  widget: {
    count: jest.fn(),
  },
};

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetricsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<MetricsService>(MetricsService);
  });

  it('returns overview metrics from real system entities', async () => {
    mockPrisma.review.count
      .mockResolvedValueOnce(15)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(3);
    mockPrisma.review.aggregate.mockResolvedValue({
      _avg: { rating: 4.4 },
    });
    mockPrisma.review.findMany.mockResolvedValue([
      {
        reviewedAt: new Date('2026-04-01T12:00:00.000Z'),
        respondedAt: new Date('2026-04-02T12:00:00.000Z'),
      },
      {
        reviewedAt: new Date('2026-04-03T12:00:00.000Z'),
        respondedAt: new Date('2026-04-03T18:00:00.000Z'),
      },
    ]);
    mockPrisma.campaign.count.mockResolvedValue(4);
    mockPrisma.scanEvent.count.mockResolvedValue(27);
    mockPrisma.widget.count
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2);

    const result = await service.getOverview(BUSINESS_ID, 30);

    expect(result.reviews.total).toBe(15);
    expect(result.reviews.new).toBe(5);
    expect(result.reviews.averageRating).toBe(4.4);
    expect(result.reviews.responseRate).toBe(60);
    expect(result.reviews.averageResponseTimeHours).toBe(15);
    expect(result.campaigns).toEqual({
      active: 4,
      scans: 27,
      clicks: null,
    });
    expect(result.widgets).toEqual({
      total: 3,
      active: 2,
      impressions: null,
      clicks: null,
    });

    expect(mockPrisma.campaign.count).toHaveBeenCalledWith({
      where: { businessId: BUSINESS_ID, status: CampaignStatus.ACTIVE },
    });
    expect(mockPrisma.widget.count).toHaveBeenNthCalledWith(2, {
      where: { businessId: BUSINESS_ID, status: WidgetStatus.ACTIVE },
    });
  });

  it('returns zero-safe metrics when there are no reviews in range', async () => {
    mockPrisma.review.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    mockPrisma.review.aggregate.mockResolvedValue({
      _avg: { rating: null },
    });
    mockPrisma.review.findMany.mockResolvedValue([]);
    mockPrisma.campaign.count.mockResolvedValue(0);
    mockPrisma.scanEvent.count.mockResolvedValue(0);
    mockPrisma.widget.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    const result = await service.getOverview(BUSINESS_ID);

    expect(result.reviews).toEqual({
      total: 0,
      new: 0,
      averageRating: 0,
      responseRate: 0,
      averageResponseTimeHours: null,
    });
  });
});
