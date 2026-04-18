import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class QrCodesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findManyByCampaign(businessId: string, campaignId: string) {
    return this.prisma.qrCode.findMany({
      where: { businessId, campaignId },
      include: {
        branch: { select: { id: true, name: true, slug: true } },
        campaign: {
          select: { id: true, name: true, slug: true, status: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(businessId: string, qrCodeId: string) {
    return this.prisma.qrCode.findFirst({
      where: { id: qrCodeId, businessId },
      include: {
        branch: { select: { id: true, name: true, slug: true } },
        campaign: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            channel: true,
            destinationType: true,
            destinationUrl: true,
            enableLanding: true,
          },
        },
      },
    });
  }

  /**
   * Creates a QR code atomically: slug uniqueness check + insert inside a
   * single transaction. Returns 'SLUG_TAKEN' if the generated slug collides.
   */
  async createAtomic(
    businessId: string,
    data: {
      campaignId: string;
      slug: string;
      branchId?: string;
      label?: string;
      destinationUrl?: string;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.qrCode.findUnique({
        where: { slug: data.slug },
      });
      if (existing) return 'SLUG_TAKEN' as const;

      return tx.qrCode.create({
        data: { businessId, ...data },
      });
    });
  }

  async update(
    businessId: string,
    qrCodeId: string,
    data: {
      label?: string;
      isActive?: boolean;
      destinationUrl?: string;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.qrCode.updateMany({
        where: { id: qrCodeId, businessId },
        data,
      });
      return tx.qrCode.findUniqueOrThrow({ where: { id: qrCodeId } });
    });
  }
}
