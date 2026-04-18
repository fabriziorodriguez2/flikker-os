import { Injectable } from '@nestjs/common';
import { CampaignStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RedirectsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Looks up a QR code by its public slug, eagerly loading the campaign
   * and business fields needed for destination resolution.
   * Only returns QR codes that are active and belong to an ACTIVE campaign.
   */
  findActiveQrBySlug(slug: string) {
    return this.prisma.qrCode.findFirst({
      where: {
        slug,
        isActive: true,
        campaign: { status: CampaignStatus.ACTIVE },
      },
      include: {
        campaign: {
          select: {
            id: true,
            channel: true,
            destinationType: true,
            destinationUrl: true,
            enableLanding: true,
          },
        },
        business: {
          select: {
            id: true,
            defaultReviewRedirectUrl: true,
            googleBusinessProfileUrl: true,
          },
        },
      },
    });
  }

  /**
   * Checks for a recent scan from the same IP + QR combo within the
   * given time window. Used for duplicate detection.
   */
  findRecentScan(qrCodeId: string, ipHash: string, since: Date) {
    return this.prisma.scanEvent.findFirst({
      where: {
        qrCodeId,
        ipHash,
        scannedAt: { gte: since },
      },
      select: { id: true },
    });
  }

  /**
   * Returns the data needed to render the public landing page for a given slug.
   * Only returns data for active QR codes with ACTIVE campaigns.
   */
  findLandingData(slug: string) {
    return this.prisma.qrCode.findFirst({
      where: {
        slug,
        isActive: true,
        campaign: { status: CampaignStatus.ACTIVE, enableLanding: true },
      },
      select: {
        destinationUrl: true,
        campaign: {
          select: {
            name: true,
            destinationUrl: true,
          },
        },
        business: {
          select: {
            name: true,
            logoUrl: true,
            primaryColor: true,
            defaultReviewRedirectUrl: true,
            googleBusinessProfileUrl: true,
          },
        },
      },
    });
  }

  /**
   * Creates a ScanEvent and atomically increments the QR code counters.
   */
  async recordScan(data: {
    qrCodeId: string;
    campaignId: string;
    businessId: string;
    branchId?: string;
    ipHash?: string;
    userAgent?: string;
    referer?: string;
    deviceType?: string;
    redirectedTo: string;
    landingShown: boolean;
    isDuplicate: boolean;
    scannedAt: Date;
  }) {
    const [scanEvent] = await this.prisma.$transaction([
      this.prisma.scanEvent.create({ data }),
      this.prisma.qrCode.update({
        where: { id: data.qrCodeId },
        data: {
          scannedCount: { increment: 1 },
          lastScannedAt: data.scannedAt,
        },
      }),
    ]);

    return scanEvent;
  }
}
