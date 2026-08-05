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
  business: {
    findUnique: jest.fn(),
  },
  businessPlan: {
    findFirst: jest.fn(),
  },
  campaign: {
    findFirst: jest.fn(),
  },
  scanEvent: {
    count: jest.fn(),
  },
  customer: {
    count: jest.fn(),
    findMany: jest.fn(),
  },
};

/** Start of the Flikker era used by the QR funnel tests. */
const FLIKKER_START = new Date('2026-04-17T00:00:00.000Z');

/** Builds `n` distinct contacts, so unique-people counting yields exactly `n`. */
function distinctContacts(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    phoneE164: `+5989${String(i).padStart(7, '0')}`,
  }));
}

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
    mockPrisma.business.findUnique.mockResolvedValue({
      messageCountCurrentMonth: 480,
      messageQuotaMonthly: 600,
    });

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
    expect(result.messageQuota).toEqual({
      used: 480,
      limit: 600,
      percentage: 80,
    });

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
    mockPrisma.business.findUnique.mockResolvedValue({
      messageCountCurrentMonth: 0,
      messageQuotaMonthly: 200,
    });

    const result = await service.getOverview(BUSINESS_ID);

    expect(result.kpis).toEqual({
      reviewsGenerated: { current: 0, previous: 0, delta: 0 },
      averageRating: { current: 0, previous: 0, delta: 0 },
      reactivatedCustomers: { current: 0, previous: 0, delta: 0 },
    });
    expect(result.negativeFeedback).toEqual([]);
    expect(result.messageQuota).toEqual({
      used: 0,
      limit: 200,
      percentage: 0,
    });
  });

  describe('getConversionSummary', () => {
    it('reports sentMessagesRecent separately from the mature sentMessages count', async () => {
      mockPrisma.message.count
        .mockResolvedValueOnce(0) // sentMessages (mature, >7 days old)
        .mockResolvedValueOnce(0) // attributedReviews
        .mockResolvedValueOnce(0) // clickedMessages
        .mockResolvedValueOnce(0) // positiveFeedback
        .mockResolvedValueOnce(0) // queuedMessages
        .mockResolvedValueOnce(0) // failedMessages
        .mockResolvedValueOnce(12); // sentMessagesRecent (<=7 days old)
      mockPrisma.googleReview.findMany.mockResolvedValue([]);

      const result = await service.getConversionSummary(BUSINESS_ID);

      expect(result.sentMessages).toBe(0);
      expect(result.sentMessagesRecent).toBe(12);
      // Recent (too-young) sends must never count toward the maturity gate.
      expect(result.insufficientData).toBe(true);

      const recentCountCall = mockPrisma.message.count.mock.calls[6]![0] as {
        where: { sentAt: { gte: Date } };
      };
      expect(recentCountCall.where.sentAt).toEqual({
        gte: expect.any(Date) as Date,
      });
      // Regression guard: the recent-count lower bound must be `cutoff` (now -
      // attributionWindowDays), not accidentally overwritten by `from` (now -
      // range) via object-spread order.
      const cutoffArg = recentCountCall.where.sentAt.gte;
      const sevenDaysAgo = Date.now() - 7 * 86_400_000;
      expect(Math.abs(cutoffArg.getTime() - sevenDaysAgo)).toBeLessThan(5000);
    });
  });

  describe('getConversionFunnel', () => {
    it('prepends "scanned" + "captured" steps for origin=qr, scoped to the qr_capture campaign', async () => {
      mockPrisma.message.count
        .mockResolvedValueOnce(40) // sent
        .mockResolvedValueOnce(25) // clicked
        .mockResolvedValueOnce(18) // positiveFeedback
        .mockResolvedValueOnce(4) // negativeFeedback
        .mockResolvedValueOnce(12); // reviewDetected
      mockPrisma.campaign.findFirst.mockResolvedValue({ id: 'qr-campaign-1' });
      mockPrisma.scanEvent.count.mockResolvedValue(90);
      mockPrisma.business.findUnique.mockResolvedValue({
        createdAt: FLIKKER_START,
      });
      mockPrisma.businessPlan.findFirst.mockResolvedValue({
        trialStart: FLIKKER_START,
        startDate: null,
      });
      mockPrisma.customer.findMany
        .mockResolvedValueOnce(distinctContacts(60)) // captured
        .mockResolvedValueOnce(distinctContacts(50)); // capturedMature
      mockPrisma.googleReview.count.mockResolvedValue(8); // reviews since Flikker

      const result = await service.getConversionFunnel(BUSINESS_ID, 7, 'qr');

      expect(mockPrisma.campaign.findFirst).toHaveBeenCalledWith({
        where: {
          businessId: BUSINESS_ID,
          status: 'ACTIVE',
          templateKind: 'qr_capture',
        },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      });
      // Scans are bounded by the Flikker start date so pre-existing activity is
      // never counted as a Flikker result.
      expect(mockPrisma.scanEvent.count).toHaveBeenCalledWith({
        where: {
          businessId: BUSINESS_ID,
          campaignId: 'qr-campaign-1',
          scannedAt: { gte: FLIKKER_START },
        },
      });
      // Captured = UNIQUE PEOPLE, read as rows and de-duplicated by phone —
      // the Customer table has no unique constraint on (businessId, phone), so
      // counting rows inflated this metric. Soft-deleted contacts are excluded.
      expect(mockPrisma.customer.findMany).toHaveBeenNthCalledWith(1, {
        where: {
          businessId: BUSINESS_ID,
          origin: 'qr',
          isActive: true,
          createdAt: { gte: FLIKKER_START },
        },
        select: { phoneE164: true },
      });
      expect(result.steps[0]).toEqual({
        key: 'scanned',
        label: 'Escanearon el QR',
        count: 90,
      });
      expect(result.steps[1]).toEqual({
        key: 'captured',
        label: 'Dejaron sus datos',
        count: 60,
      });
      expect(result.steps[2]).toEqual({
        key: 'captured_mature',
        label: 'Dejaron sus datos (hace 7+ días)',
        count: 50,
      });
      expect(result.steps.map((s) => s.key)).toEqual([
        'scanned',
        'captured',
        'captured_mature',
        'sent',
        'clicked',
        'positive_feedback',
        'negative_feedback_filtered',
        'review_detected',
        'reviews_since_flikker',
      ]);
    });

    it('returns 0 scans and captures for origin=qr when there is no active qr_capture campaign', async () => {
      mockPrisma.message.count.mockResolvedValue(0);
      mockPrisma.campaign.findFirst.mockResolvedValue(null);
      mockPrisma.business.findUnique.mockResolvedValue({
        createdAt: FLIKKER_START,
      });
      mockPrisma.businessPlan.findFirst.mockResolvedValue(null);
      mockPrisma.customer.findMany.mockResolvedValue([]);
      mockPrisma.googleReview.count.mockResolvedValue(0);

      const result = await service.getConversionFunnel(BUSINESS_ID, 7, 'qr');

      expect(mockPrisma.scanEvent.count).not.toHaveBeenCalled();
      expect(result.steps[0]).toEqual({
        key: 'scanned',
        label: 'Escanearon el QR',
        count: 0,
      });
    });

    it('does not add scan/capture steps for other origins', async () => {
      mockPrisma.message.count.mockResolvedValue(0);

      const result = await service.getConversionFunnel(
        BUSINESS_ID,
        7,
        'manual',
      );

      expect(mockPrisma.campaign.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.customer.count).not.toHaveBeenCalled();
      expect(result.steps.map((s) => s.key)).not.toContain('scanned');
      expect(result.steps.map((s) => s.key)).not.toContain('captured');
    });

    it('does not add scan/capture steps when no origin is given', async () => {
      mockPrisma.message.count.mockResolvedValue(0);

      const result = await service.getConversionFunnel(BUSINESS_ID, 7);

      expect(result.steps.map((s) => s.key)).not.toContain('scanned');
      expect(result.steps.map((s) => s.key)).not.toContain('captured');
    });
  });
});
