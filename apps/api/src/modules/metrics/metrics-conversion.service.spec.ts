import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { MetricsService } from './metrics.service';

const BIZ = 'biz-1';

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    message: {
      count: jest.fn().mockResolvedValue(0),
    },
    googleReview: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    // other models used by getOverview — not relevant here
    business: { findUnique: jest.fn().mockResolvedValue(null) },
    campaignExecution: { findMany: jest.fn().mockResolvedValue([]) },
    feedbackResponse: { findMany: jest.fn().mockResolvedValue([]) },
    ...overrides,
  } as unknown as PrismaService;
}

async function buildService(prisma: PrismaService) {
  const module = await Test.createTestingModule({
    providers: [MetricsService, { provide: PrismaService, useValue: prisma }],
  }).compile();
  return module.get(MetricsService);
}

describe('MetricsService — conversion', () => {
  // ── getConversionSummary ───────────────────────────────────────────────

  describe('getConversionSummary', () => {
    it('returns insufficientData when sentMessages < 30', async () => {
      const prisma = makePrisma();
      // All message.count calls return 5 (below the 30-sample threshold)
      (prisma.message.count as jest.Mock).mockResolvedValue(5);

      const svc = await buildService(prisma);
      const result = await svc.getConversionSummary(BIZ, 'last_30_days', 7);

      expect(result.insufficientData).toBe(true);
      expect(result.conversionRate).toBeNull();
    });

    it('calculates conversionRate correctly when sample is sufficient', async () => {
      const prisma = makePrisma();
      // First call = sentMessages (100), second = attributedReviews (30), rest = 0
      (prisma.message.count as jest.Mock)
        .mockResolvedValueOnce(100) // sentMessages
        .mockResolvedValueOnce(30) // attributedReviews
        .mockResolvedValue(0); // clickedMessages, positiveFeedback, queued, failed

      const svc = await buildService(prisma);
      const result = await svc.getConversionSummary(BIZ, 'last_30_days', 7);

      expect(result.insufficientData).toBe(false);
      expect(result.sentMessages).toBe(100);
      expect(result.attributedReviews).toBe(30);
      expect(result.conversionRate).toBe(30.0);
    });

    it('returns null rates when sentMessages is 0', async () => {
      const prisma = makePrisma();
      (prisma.message.count as jest.Mock).mockResolvedValue(0);

      const svc = await buildService(prisma);
      const result = await svc.getConversionSummary(BIZ, 'all_time', 7);

      expect(result.conversionRate).toBeNull();
      expect(result.clickRate).toBeNull();
      expect(result.positiveFeedbackRate).toBeNull();
      expect(result.insufficientData).toBe(true);
    });

    it('sets from=null for all_time range', async () => {
      const prisma = makePrisma();
      (prisma.message.count as jest.Mock).mockResolvedValue(0);

      const svc = await buildService(prisma);
      const result = await svc.getConversionSummary(BIZ, 'all_time', 7);

      expect(result.from).toBeNull();
      expect(result.range).toBe('all_time');
    });

    it('normalizes unknown range to last_30_days', async () => {
      const prisma = makePrisma();
      (prisma.message.count as jest.Mock).mockResolvedValue(0);

      const svc = await buildService(prisma);
      const result = await svc.getConversionSummary(BIZ, 'unknown_range', 7);

      expect(result.range).toBe('last_30_days');
    });

    it('always returns benchmark: null', async () => {
      const prisma = makePrisma();
      (prisma.message.count as jest.Mock).mockResolvedValue(0);

      const svc = await buildService(prisma);
      const result = await svc.getConversionSummary(BIZ, 'last_30_days', 7);

      expect(result.benchmark).toBeNull();
    });

    it('returns medianTimeToReviewHours from googleReview deltas', async () => {
      const prisma = makePrisma();
      (prisma.message.count as jest.Mock).mockResolvedValue(0);

      const now = new Date();
      const sentAt = new Date(now.getTime() - 12 * 3_600_000); // 12h ago
      (prisma.googleReview.findMany as jest.Mock).mockResolvedValue([
        { postedAt: now, attributedMessage: { sentAt } },
      ]);

      const svc = await buildService(prisma);
      const result = await svc.getConversionSummary(BIZ, 'all_time', 7);

      expect(result.medianTimeToReviewHours).toBe(12.0);
    });
  });

  // ── getConversionFunnel ────────────────────────────────────────────────

  describe('getConversionFunnel', () => {
    it('returns all 5 funnel steps', async () => {
      const prisma = makePrisma();
      (prisma.message.count as jest.Mock)
        .mockResolvedValueOnce(200) // sent
        .mockResolvedValueOnce(120) // clicked
        .mockResolvedValueOnce(90) // positive_feedback
        .mockResolvedValueOnce(30) // negative_feedback_filtered
        .mockResolvedValueOnce(45); // review_detected

      const svc = await buildService(prisma);
      const result = await svc.getConversionFunnel(BIZ, 7);

      expect(result.steps).toHaveLength(5);
      expect(result.steps.map((s) => s.key)).toEqual([
        'sent',
        'clicked',
        'positive_feedback',
        'negative_feedback_filtered',
        'review_detected',
      ]);
      expect(result.steps[3].label).toBe(
        'Filtrados antes de Google (feedback negativo)',
      );
    });

    it('topDropOffStep points to the transition with lowest ratio', async () => {
      // sent=200, clicked=180 (ratio 0.90), positiveFeedback=100 (ratio 0.56), review=40 (ratio 0.40)
      // → positive_to_review (0.40) is the worst
      const prisma = makePrisma();
      (prisma.message.count as jest.Mock)
        .mockResolvedValueOnce(200)
        .mockResolvedValueOnce(180)
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(20)
        .mockResolvedValueOnce(40);

      const svc = await buildService(prisma);
      const result = await svc.getConversionFunnel(BIZ, 7);

      expect(result.topDropOffStep?.step).toBe('positive_to_review');
      expect(result.topDropOffStep?.ratio).toBe(0.4);
    });

    it('returns topDropOffStep: null when all counts are 0', async () => {
      const prisma = makePrisma();
      (prisma.message.count as jest.Mock).mockResolvedValue(0);

      const svc = await buildService(prisma);
      const result = await svc.getConversionFunnel(BIZ, 7);

      expect(result.topDropOffStep).toBeNull();
    });
  });

  // ── getConversionTimeSeries ────────────────────────────────────────────

  describe('getConversionTimeSeries', () => {
    it('returns 6 periods for monthly granularity', async () => {
      const prisma = makePrisma();
      (prisma.message.count as jest.Mock).mockResolvedValue(0);

      const svc = await buildService(prisma);
      const result = await svc.getConversionTimeSeries(BIZ, 'month', 7);

      expect(result.granularity).toBe('month');
      expect(result.series.length).toBe(6);
    });

    it('returns 8 periods for weekly granularity', async () => {
      const prisma = makePrisma();
      (prisma.message.count as jest.Mock).mockResolvedValue(0);

      const svc = await buildService(prisma);
      const result = await svc.getConversionTimeSeries(BIZ, 'week', 7);

      expect(result.granularity).toBe('week');
      expect(result.series.length).toBe(8);
    });

    it('returns rate: null for periods with fewer than 30 sent messages', async () => {
      const prisma = makePrisma();
      // 10 sent, 5 attributed for every period
      (prisma.message.count as jest.Mock)
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(5)
        .mockResolvedValue(0);

      const svc = await buildService(prisma);
      const result = await svc.getConversionTimeSeries(BIZ, 'month', 7);

      expect(result.series[0].rate).toBeNull();
    });

    it('calculates rate when sent >= 30', async () => {
      const prisma = makePrisma();
      // Alternate: 50 sent / 15 attributed for first period, then 0 for the rest
      let callCount = 0;
      (prisma.message.count as jest.Mock).mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve(50);
        if (callCount === 2) return Promise.resolve(15);
        return Promise.resolve(0);
      });

      const svc = await buildService(prisma);
      const result = await svc.getConversionTimeSeries(BIZ, 'month', 7);

      // 15/50 = 30.0%
      expect(result.series[0].rate).toBe(30.0);
    });
  });

  // ── median helper (via getConversionSummary) ──────────────────────────

  describe('median calculation', () => {
    it('returns the median (not mean) of time deltas', async () => {
      const prisma = makePrisma();
      (prisma.message.count as jest.Mock).mockResolvedValue(0);

      const now = new Date();
      // Deltas: 2h, 10h, 100h → sorted [2, 10, 100] → median = 10
      const mkReview = (hoursAgo: number) => ({
        postedAt: now,
        attributedMessage: {
          sentAt: new Date(now.getTime() - hoursAgo * 3_600_000),
        },
      });
      (prisma.googleReview.findMany as jest.Mock).mockResolvedValue([
        mkReview(2),
        mkReview(10),
        mkReview(100),
      ]);

      const svc = await buildService(prisma);
      const result = await svc.getConversionSummary(BIZ, 'all_time', 7);

      expect(result.medianTimeToReviewHours).toBe(10.0);
    });

    it('returns null when no attributed reviews exist', async () => {
      const prisma = makePrisma();
      (prisma.message.count as jest.Mock).mockResolvedValue(0);
      (prisma.googleReview.findMany as jest.Mock).mockResolvedValue([]);

      const svc = await buildService(prisma);
      const result = await svc.getConversionSummary(BIZ, 'all_time', 7);

      expect(result.medianTimeToReviewHours).toBeNull();
    });

    it('handles even-length arrays with mid-point average', async () => {
      const prisma = makePrisma();
      (prisma.message.count as jest.Mock).mockResolvedValue(0);

      const now = new Date();
      // Deltas: 4h, 6h → median = (4+6)/2 = 5
      const mkReview = (hoursAgo: number) => ({
        postedAt: now,
        attributedMessage: {
          sentAt: new Date(now.getTime() - hoursAgo * 3_600_000),
        },
      });
      (prisma.googleReview.findMany as jest.Mock).mockResolvedValue([
        mkReview(4),
        mkReview(6),
      ]);

      const svc = await buildService(prisma);
      const result = await svc.getConversionSummary(BIZ, 'all_time', 7);

      expect(result.medianTimeToReviewHours).toBe(5.0);
    });
  });
});
