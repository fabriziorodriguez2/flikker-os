import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeToE164 } from '../../common/utils/phone.util';

@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) {}

  async getQrInfo(businessId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId, isActive: true },
      select: {
        name: true,
        logoUrl: true,
        primaryColor: true,
        googleBusinessProfileUrl: true,
        campaigns: {
          where: { status: 'ACTIVE', templateKind: 'post_service' },
          select: { offerText: true },
          take: 1,
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!business) throw new NotFoundException('Business not found');

    return {
      businessName: business.name,
      logoUrl: business.logoUrl ?? null,
      primaryColor: business.primaryColor ?? null,
      googleBusinessProfileUrl: business.googleBusinessProfileUrl ?? null,
      benefitText: business.campaigns[0]?.offerText ?? null,
    };
  }

  async captureContact(businessId: string, name: string, rawPhone: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId, isActive: true },
      select: { id: true },
    });
    if (!business) throw new NotFoundException('Business not found');

    let phoneE164: string;
    try {
      phoneE164 = normalizeToE164(rawPhone);
    } catch {
      throw new BadRequestException('Número de teléfono inválido');
    }

    const existing = await this.prisma.customer.findFirst({
      where: { businessId, phoneE164, isActive: true },
    });

    if (existing) {
      await this.prisma.customer.update({
        where: { id: existing.id },
        data: { name },
      });
    } else {
      await this.prisma.customer.create({
        data: { businessId, name, phoneE164 },
      });
    }

    return { ok: true };
  }
}
