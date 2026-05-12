import { Test, TestingModule } from '@nestjs/testing';
import { CampaignExecutionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MetricsService } from './metrics.service';

const BUSINESS_ID = 'biz-1';

const mockPrisma = {
  googleReview: {
    count: jest.fn(),
    findMany: jest.fn(),
  },
  message: {
    count: jest.fn(),
  },
  campaignExecution: {
    findMany: jest.fn(),
  },
  feedbackResponse: {
    findMany: jest.fn(),
  },
};

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-03T12:00:00.000Z'));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetricsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<MetricsService>(MetricsService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns the MVP dashboard with exactly three KPIs', async () => {
    mockPrisma.googleReview.count
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(12)
      .mockResolvedValue(0);
    mockPrisma.message.count.mockResolvedValue(0);
    mockPrisma.googleReview.findMany
      .mockResolvedValueOnce([{ stars: 5 }, { stars: 4 }, { stars: 4 }])
      .mockResolvedValueOnce([{ stars: 4 }, { stars: 4 }]);
    mockPrisma.campaignExecution.findMany
      .mockResolvedValueOnce([
        { customerId: 'cust-1' },
        { customerId: 'cust-2' },
      ])
      .mockResolvedValueOnce([{ customerId: 'cust-3' }])
      .mockResolvedValue([]);
    mockPrisma.feedbackResponse.findMany.mockResolvedValue([
      {
        id: 'feedback-1',
        createdAt: new Date('2026-05-02T09:00:00.000Z'),
        score: 2,
        comment: 'Demora larga',
        acknowledgedByOwner: false,
        customer: { name: 'Maria Garcia' },
      },
    ]);

    const result = await service.getOverview(BUSINESS_ID);

    expect(Object.keys(result.kpis)).toEqual([
      'reviewsGenerated',
      'averageRating',
      'reactivatedCustomers',
    ]);
    expect(result.kpis.reviewsGenerated).toEqual({
      current: 12,
      previous: 8,
      delta: 4,
    });
    expect(result.kpis.averageRating).toEqual({
      current: 4.3,
      previous: 4,
      delta: 0.3,
    });
    expect(result.kpis.reactivatedCustomers).toEqual({
      current: 2,
      previous: 1,
      delta: 1,
    });
    expect(result.reviewsByMonth).toHaveLength(6);
    expect(result.reviewsByMonth.map((month) => month.total)).toEqual([
      1, 2, 3, 4, 8, 12,
    ]);
    expect(result.activityByMonth).toHaveLength(6);
    expect(result.activityByMonth[0]).toEqual({
      month: '2025-12-01T00:00:00.000Z',
      label: 'Dic',
      messagesSent: 0,
      reviewsGenerated: 0,
      reactivatedCustomers: 0,
    });
    expect(result.negativeFeedback).toEqual([
      {
        id: 'feedback-1',
        createdAt: '2026-05-02T09:00:00.000Z',
        customerName: 'Maria Garcia',
        score: 2,
        comment: 'Demora larga',
        acknowledgedByOwner: false,
      },
    ]);

    expect(mockPrisma.googleReview.count).toHaveBeenNthCalledWith(1, {
      where: {
        businessId: BUSINESS_ID,
        postedAt: {
          gte: new Date('2026-05-01T00:00:00.000Z'),
          lt: new Date('2026-06-01T00:00:00.000Z'),
        },
      },
    });
    expect(mockPrisma.campaignExecution.findMany).toHaveBeenCalledWith({
      where: {
        businessId: BUSINESS_ID,
        status: CampaignExecutionStatus.responded,
        respondedAt: {
          gte: new Date('2026-05-01T00:00:00.000Z'),
          lt: new Date('2026-06-01T00:00:00.000Z'),
        },
      },
      distinct: ['customerId'],
      select: { customerId: true },
    });
  });

  it('returns zero-safe values when there is no data', async () => {
    mockPrisma.googleReview.count.mockResolvedValue(0);
    mockPrisma.message.count.mockResolvedValue(0);
    mockPrisma.googleReview.findMany.mockResolvedValue([]);
    mockPrisma.campaignExecution.findMany.mockResolvedValue([]);
    mockPrisma.feedbackResponse.findMany.mockResolvedValue([]);

    const result = await service.getOverview(BUSINESS_ID);

    expect(result.kpis).toEqual({
      reviewsGenerated: { current: 0, previous: 0, delta: 0 },
      averageRating: { current: 0, previous: 0, delta: 0 },
      reactivatedCustomers: { current: 0, previous: 0, delta: 0 },
    });
    expect(result.negativeFeedback).toEqual([]);
  });
});
