import { Test, TestingModule } from '@nestjs/testing';
import { CampaignStatsService } from './campaigns.stats.service';
import { PrismaService } from '../../prisma/prisma.service';

const BUSINESS_ID = 'biz-1';
const CAMPAIGN_ID = 'cmp-1';
const QR_ID = 'qr-1';
const BRANCH_ID = 'br-1';

const range = CampaignStatsService.resolveDateRange('2026-03-01', '2026-03-31');

/**
 * Smart groupBy mock that dispatches based on the `by` field.
 */
function makeGroupByMock(config: {
  deviceType?: unknown[];
  qrCodeId?: unknown[];
  branchId?: unknown[];
}) {
  return jest.fn().mockImplementation((args: { by: string[] }) => {
    const field = args.by[0];
    return Promise.resolve(config[field as keyof typeof config] ?? []);
  });
}

const mockPrisma = {
  scanEvent: {
    count: jest.fn(),
    groupBy: jest.fn(),
  },
  qrCode: {
    findMany: jest.fn(),
  },
  branch: {
    findMany: jest.fn(),
  },
  $queryRawUnsafe: jest.fn(),
};

describe('CampaignStatsService', () => {
  let service: CampaignStatsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Defaults: everything returns empty
    mockPrisma.scanEvent.count.mockResolvedValue(0);
    mockPrisma.scanEvent.groupBy.mockResolvedValue([]);
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
    mockPrisma.qrCode.findMany.mockResolvedValue([]);
    mockPrisma.branch.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignStatsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CampaignStatsService>(CampaignStatsService);
  });

  // ---------------------------------------------------------------------------
  // resolveDateRange
  // ---------------------------------------------------------------------------
  describe('resolveDateRange', () => {
    it('returns provided from/to dates', () => {
      const r = CampaignStatsService.resolveDateRange(
        '2026-03-01',
        '2026-03-31',
      );
      // Compare local date parts (setHours uses local timezone)
      expect(r.from.getFullYear()).toBe(2026);
      expect(r.from.getMonth()).toBe(2); // March = 2
      expect(r.from.getDate()).toBe(1);
      expect(r.to.getFullYear()).toBe(2026);
      expect(r.to.getMonth()).toBe(2);
      expect(r.to.getDate()).toBe(31);
    });

    it('defaults to approximately 30 days when no args provided', () => {
      const r = CampaignStatsService.resolveDateRange();
      const diffMs = r.to.getTime() - r.from.getTime();
      const diffDays = diffMs / (24 * 60 * 60 * 1000);
      // Between 30 and 31 days due to end-of-day rounding
      expect(diffDays).toBeGreaterThanOrEqual(30);
      expect(diffDays).toBeLessThanOrEqual(31);
    });

    it('sets from to start of day and to to end of day', () => {
      const r = CampaignStatsService.resolveDateRange(
        '2026-03-15',
        '2026-03-15',
      );
      expect(r.from.getHours()).toBe(0);
      expect(r.from.getMinutes()).toBe(0);
      expect(r.to.getHours()).toBe(23);
      expect(r.to.getMinutes()).toBe(59);
    });
  });

  // ---------------------------------------------------------------------------
  // getCampaignStats
  // ---------------------------------------------------------------------------
  describe('getCampaignStats', () => {
    it('returns all zero stats when no events exist', async () => {
      const stats = await service.getCampaignStats(
        BUSINESS_ID,
        CAMPAIGN_ID,
        range,
      );

      expect(stats.totalScans).toBe(0);
      expect(stats.uniqueScans).toBe(0);
      expect(stats.byDevice).toEqual({
        mobile: 0,
        desktop: 0,
        tablet: 0,
        unknown: 0,
      });
      expect(stats.byDay).toEqual([]);
      expect(stats.byQrCode).toEqual([]);
      expect(stats.byBranch).toEqual([]);
    });

    it('returns correct totals and unique counts', async () => {
      mockPrisma.scanEvent.count
        .mockResolvedValueOnce(50) // totalScans
        .mockResolvedValueOnce(42); // uniqueScans

      const stats = await service.getCampaignStats(
        BUSINESS_ID,
        CAMPAIGN_ID,
        range,
      );

      expect(stats.totalScans).toBe(50);
      expect(stats.uniqueScans).toBe(42);
    });

    it('aggregates device breakdown correctly', async () => {
      mockPrisma.scanEvent.groupBy = makeGroupByMock({
        deviceType: [
          { deviceType: 'mobile', _count: 30 },
          { deviceType: 'desktop', _count: 15 },
          { deviceType: 'tablet', _count: 5 },
          { deviceType: null, _count: 2 },
        ],
      });

      const stats = await service.getCampaignStats(
        BUSINESS_ID,
        CAMPAIGN_ID,
        range,
      );

      expect(stats.byDevice.mobile).toBe(30);
      expect(stats.byDevice.desktop).toBe(15);
      expect(stats.byDevice.tablet).toBe(5);
      expect(stats.byDevice.unknown).toBe(2);
    });

    it('returns daily series from raw query', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        {
          date: new Date('2026-03-15'),
          total: BigInt(10),
          unique: BigInt(8),
        },
        {
          date: new Date('2026-03-16'),
          total: BigInt(15),
          unique: BigInt(12),
        },
      ]);

      const stats = await service.getCampaignStats(
        BUSINESS_ID,
        CAMPAIGN_ID,
        range,
      );

      expect(stats.byDay).toHaveLength(2);
      expect(stats.byDay[0]).toEqual({
        date: '2026-03-15',
        total: 10,
        unique: 8,
      });
      expect(stats.byDay[1]).toEqual({
        date: '2026-03-16',
        total: 15,
        unique: 12,
      });
    });

    it('returns QR code breakdown with labels', async () => {
      mockPrisma.scanEvent.groupBy = makeGroupByMock({
        qrCodeId: [{ qrCodeId: QR_ID, _count: 20 }],
      });
      mockPrisma.qrCode.findMany.mockResolvedValue([
        { id: QR_ID, label: 'Mesa 1', slug: 'aBcDeFgH' },
      ]);

      const stats = await service.getCampaignStats(
        BUSINESS_ID,
        CAMPAIGN_ID,
        range,
      );

      expect(stats.byQrCode).toHaveLength(1);
      expect(stats.byQrCode[0]).toMatchObject({
        qrCodeId: QR_ID,
        label: 'Mesa 1',
        slug: 'aBcDeFgH',
        total: 20,
      });
    });

    it('returns branch breakdown with names', async () => {
      mockPrisma.scanEvent.groupBy = makeGroupByMock({
        branchId: [{ branchId: BRANCH_ID, _count: 30 }],
      });
      mockPrisma.branch.findMany.mockResolvedValue([
        { id: BRANCH_ID, name: 'Centro' },
      ]);

      const stats = await service.getCampaignStats(
        BUSINESS_ID,
        CAMPAIGN_ID,
        range,
      );

      expect(stats.byBranch).toHaveLength(1);
      expect(stats.byBranch[0]).toMatchObject({
        branchId: BRANCH_ID,
        branchName: 'Centro',
        total: 30,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // getQrCodeStats
  // ---------------------------------------------------------------------------
  describe('getQrCodeStats', () => {
    it('returns stats for a single QR code', async () => {
      mockPrisma.scanEvent.count
        .mockResolvedValueOnce(20) // total
        .mockResolvedValueOnce(17); // unique
      mockPrisma.scanEvent.groupBy = makeGroupByMock({
        deviceType: [
          { deviceType: 'mobile', _count: 15 },
          { deviceType: 'desktop', _count: 5 },
        ],
      });
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        {
          date: new Date('2026-03-20'),
          total: BigInt(20),
          unique: BigInt(17),
        },
      ]);

      const stats = await service.getQrCodeStats(BUSINESS_ID, QR_ID, range);

      expect(stats.totalScans).toBe(20);
      expect(stats.uniqueScans).toBe(17);
      expect(stats.byDevice.mobile).toBe(15);
      expect(stats.byDevice.desktop).toBe(5);
      expect(stats.byDay).toHaveLength(1);
    });

    it('returns all zero stats when no events exist', async () => {
      const stats = await service.getQrCodeStats(BUSINESS_ID, QR_ID, range);

      expect(stats.totalScans).toBe(0);
      expect(stats.uniqueScans).toBe(0);
      expect(stats.byDevice).toEqual({
        mobile: 0,
        desktop: 0,
        tablet: 0,
        unknown: 0,
      });
      expect(stats.byDay).toEqual([]);
    });
  });
});
