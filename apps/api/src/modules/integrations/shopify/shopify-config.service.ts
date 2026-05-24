import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { UpsertShopifyIntegrationDto } from './dto/upsert-integration.dto';

@Injectable()
export class ShopifyConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getIntegration(businessId: string) {
    const integration = await this.prisma.shopifyIntegration.findUnique({
      where: { businessId },
      select: {
        id: true,
        shopDomain: true,
        delayHours: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return { integration };
  }

  async upsertIntegration(businessId: string, dto: UpsertShopifyIntegrationDto) {
    const shopDomain = dto.shopDomain.toLowerCase().trim().replace(/^https?:\/\//, '');

    const integration = await this.prisma.shopifyIntegration.upsert({
      where: { businessId },
      update: {
        shopDomain,
        ...(dto.webhookSecret ? { webhookSecret: dto.webhookSecret } : {}),
        isActive: true,
      },
      create: {
        businessId,
        shopDomain,
        webhookSecret: dto.webhookSecret ?? '',
        delayHours: 24,
      },
      select: {
        id: true,
        shopDomain: true,
        delayHours: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return { integration };
  }

  async deleteIntegration(businessId: string) {
    const existing = await this.prisma.shopifyIntegration.findUnique({
      where: { businessId },
    });

    if (!existing) throw new NotFoundException('No Shopify integration found');

    await this.prisma.shopifyIntegration.update({
      where: { businessId },
      data: { isActive: false },
    });

    return { ok: true };
  }

  async getRecentOrders(businessId: string) {
    const orders = await this.prisma.shopifyOrder.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        shopifyOrderId: true,
        customerName: true,
        customerPhone: true,
        status: true,
        scheduledAt: true,
        processedAt: true,
        skipReason: true,
        createdAt: true,
      },
    });
    return { orders };
  }
}
