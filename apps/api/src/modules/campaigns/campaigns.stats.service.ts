import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const DEFAULT_DAYS = 30;

export interface DateRange {
  from: Date;
  to: Date;
}

export interface DayStat {
  date: string; // YYYY-MM-DD
  total: number;
  unique: number;
}

export interface DeviceBreakdown {
  mobile: number;
  desktop: number;
  tablet: number;
  unknown: number;
}

export interface QrCodeStat {
  qrCodeId: string;
  label: string | null;
  slug: string;
  total: number;
  unique: number;
}

export interface BranchStat {
  branchId: string;
  branchName: string;
  total: number;
  unique: number;
}

export interface CampaignStats {
  totalScans: number;
  uniqueScans: number;
  byDevice: DeviceBreakdown;
  byDay: DayStat[];
  byQrCode: QrCodeStat[];
  byBranch: BranchStat[];
}

export interface QrCodeStats {
  totalScans: number;
  uniqueScans: number;
  byDevice: DeviceBreakdown;
  byDay: DayStat[];
}

@Injectable()
export class CampaignStatsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves from/to query params into a DateRange.
   * Defaults to last 30 days.
   */
  static resolveDateRange(from?: string, to?: string): DateRange {
    // Append T00:00:00 to date-only strings so they parse as local time,
    // not UTC (which would shift the date in non-UTC timezones).
    const toDate = to ? new Date(`${to}T23:59:59.999`) : new Date();
    if (!to) toDate.setHours(23, 59, 59, 999);

    const fromDate = from
      ? new Date(`${from}T00:00:00`)
      : new Date(toDate.getTime() - DEFAULT_DAYS * 24 * 60 * 60 * 1000);
    if (!from) fromDate.setHours(0, 0, 0, 0);

    return { from: fromDate, to: toDate };
  }

  async getCampaignStats(
    businessId: string,
    campaignId: string,
    range: DateRange,
  ): Promise<CampaignStats> {
    const where = {
      businessId,
      campaignId,
      scannedAt: { gte: range.from, lte: range.to },
    };

    const [totalScans, uniqueScans, byDevice, byDay, byQrCode, byBranch] =
      await Promise.all([
        this.prisma.scanEvent.count({ where }),
        this.prisma.scanEvent.count({
          where: { ...where, isDuplicate: false },
        }),
        this.getDeviceBreakdown(where),
        this.getDailySeries(where),
        this.getQrCodeBreakdown(businessId, campaignId, range),
        this.getBranchBreakdown(businessId, campaignId, range),
      ]);

    return { totalScans, uniqueScans, byDevice, byDay, byQrCode, byBranch };
  }

  async getQrCodeStats(
    businessId: string,
    qrCodeId: string,
    range: DateRange,
  ): Promise<QrCodeStats> {
    const where = {
      businessId,
      qrCodeId,
      scannedAt: { gte: range.from, lte: range.to },
    };

    const [totalScans, uniqueScans, byDevice, byDay] = await Promise.all([
      this.prisma.scanEvent.count({ where }),
      this.prisma.scanEvent.count({ where: { ...where, isDuplicate: false } }),
      this.getDeviceBreakdown(where),
      this.getDailySeries(where),
    ]);

    return { totalScans, uniqueScans, byDevice, byDay };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async getDeviceBreakdown(where: {
    businessId: string;
    campaignId?: string;
    qrCodeId?: string;
    scannedAt: { gte: Date; lte: Date };
  }): Promise<DeviceBreakdown> {
    const groups = await this.prisma.scanEvent.groupBy({
      by: ['deviceType'],
      where,
      _count: true,
    });

    const breakdown: DeviceBreakdown = {
      mobile: 0,
      desktop: 0,
      tablet: 0,
      unknown: 0,
    };

    for (const g of groups) {
      const key = g.deviceType as keyof DeviceBreakdown;
      if (key in breakdown) {
        breakdown[key] = g._count;
      } else {
        breakdown.unknown += g._count;
      }
    }

    return breakdown;
  }

  private async getDailySeries(where: {
    businessId: string;
    campaignId?: string;
    qrCodeId?: string;
    scannedAt: { gte: Date; lte: Date };
  }): Promise<DayStat[]> {
    // Build conditions for raw query
    const conditions: string[] = [
      `"businessId" = $1`,
      `"scannedAt" >= $3`,
      `"scannedAt" <= $4`,
    ];
    const params: unknown[] = [where.businessId];

    if (where.campaignId) {
      params.push(where.campaignId);
      conditions.push(`"campaignId" = $2`);
    } else if (where.qrCodeId) {
      params.push(where.qrCodeId);
      conditions.push(`"qrCodeId" = $2`);
    } else {
      params.push(null); // placeholder for $2
    }

    params.push(where.scannedAt.gte, where.scannedAt.lte);

    const rows = await this.prisma.$queryRawUnsafe<
      { date: Date; total: bigint; unique: bigint }[]
    >(
      `SELECT
         DATE("scannedAt") as date,
         COUNT(*)::bigint as total,
         COUNT(*) FILTER (WHERE "isDuplicate" = false)::bigint as unique
       FROM "ScanEvent"
       WHERE ${conditions.join(' AND ')}
       GROUP BY DATE("scannedAt")
       ORDER BY date ASC`,
      ...params,
    );

    return rows.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      total: Number(r.total),
      unique: Number(r.unique),
    }));
  }

  private async getQrCodeBreakdown(
    businessId: string,
    campaignId: string,
    range: DateRange,
  ): Promise<QrCodeStat[]> {
    const where = {
      businessId,
      campaignId,
      scannedAt: { gte: range.from, lte: range.to },
    };

    const groups = await this.prisma.scanEvent.groupBy({
      by: ['qrCodeId'],
      where,
      _count: true,
    });

    const uniqueGroups = await this.prisma.scanEvent.groupBy({
      by: ['qrCodeId'],
      where: { ...where, isDuplicate: false },
      _count: true,
    });

    const uniqueMap = new Map(uniqueGroups.map((g) => [g.qrCodeId, g._count]));

    // Fetch QR code labels/slugs
    const qrIds = groups.map((g) => g.qrCodeId);
    const qrCodes = await this.prisma.qrCode.findMany({
      where: { id: { in: qrIds }, businessId },
      select: { id: true, label: true, slug: true },
    });
    const qrMap = new Map(qrCodes.map((q) => [q.id, q]));

    return groups
      .map((g) => {
        const qr = qrMap.get(g.qrCodeId);
        return {
          qrCodeId: g.qrCodeId,
          label: qr?.label ?? null,
          slug: qr?.slug ?? '',
          total: g._count,
          unique: uniqueMap.get(g.qrCodeId) ?? 0,
        };
      })
      .sort((a, b) => b.total - a.total);
  }

  private async getBranchBreakdown(
    businessId: string,
    campaignId: string,
    range: DateRange,
  ): Promise<BranchStat[]> {
    const where = {
      businessId,
      campaignId,
      branchId: { not: null as string | null },
      scannedAt: { gte: range.from, lte: range.to },
    };

    const groups = await this.prisma.scanEvent.groupBy({
      by: ['branchId'],
      where,
      _count: true,
    });

    const uniqueGroups = await this.prisma.scanEvent.groupBy({
      by: ['branchId'],
      where: { ...where, isDuplicate: false },
      _count: true,
    });

    const uniqueMap = new Map(uniqueGroups.map((g) => [g.branchId, g._count]));

    // Fetch branch names
    const branchIds = groups
      .map((g) => g.branchId)
      .filter((id): id is string => id !== null);
    const branches = await this.prisma.branch.findMany({
      where: { id: { in: branchIds }, businessId },
      select: { id: true, name: true },
    });
    const branchMap = new Map(branches.map((b) => [b.id, b.name]));

    return groups
      .filter((g) => g.branchId !== null)
      .map((g) => ({
        branchId: g.branchId!,
        branchName: branchMap.get(g.branchId!) ?? 'Unknown',
        total: g._count,
        unique: uniqueMap.get(g.branchId) ?? 0,
      }))
      .sort((a, b) => b.total - a.total);
  }
}
