import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { MessageChannel, MessageStatus, ServiceEventCreatedVia } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ReviewRequestQueue } from '../../../jobs/review-request.queue';
import { normalizeToE164 } from '../../../common/utils/phone.util';
import type { ShopifyOrderWebhookDto } from './dto/shopify-order-webhook.dto';

@Injectable()
export class ShopifyWebhookService {
  private readonly logger = new Logger(ShopifyWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reviewRequestQueue: ReviewRequestQueue,
  ) {}

  async processOrder(shopDomain: string, order: ShopifyOrderWebhookDto): Promise<void> {
    const integration = await this.prisma.shopifyIntegration.findUnique({
      where: { shopDomain },
    });

    if (!integration || !integration.isActive) {
      this.logger.warn(`No active integration for shop domain: ${shopDomain}`);
      return;
    }

    const shopifyOrderId = String(order.id);
    const existing = await this.prisma.shopifyOrder.findUnique({
      where: { integrationId_shopifyOrderId: { integrationId: integration.id, shopifyOrderId } },
    });

    if (existing) {
      this.logger.log(`Duplicate Shopify order ${shopifyOrderId} for integration ${integration.id} — skipping`);
      return;
    }

    const rawPhone =
      order.customer?.phone ||
      order.phone ||
      order.billing_address?.phone ||
      '';

    const customerName = [
      order.customer?.first_name,
      order.customer?.last_name,
    ]
      .filter(Boolean)
      .join(' ')
      .trim() || 'Cliente';

    const customerEmail = order.customer?.email || order.email || undefined;

    if (!rawPhone) {
      await this.prisma.shopifyOrder.create({
        data: {
          businessId: integration.businessId,
          integrationId: integration.id,
          shopifyOrderId,
          customerName,
          customerEmail,
          status: 'skipped',
          skipReason: 'no_phone',
        },
      });
      this.logger.log(`Shopify order ${shopifyOrderId}: no phone — skipped`);
      return;
    }

    let phoneE164: string;
    try {
      phoneE164 = normalizeToE164(rawPhone);
    } catch {
      await this.prisma.shopifyOrder.create({
        data: {
          businessId: integration.businessId,
          integrationId: integration.id,
          shopifyOrderId,
          customerName,
          customerPhone: rawPhone,
          customerEmail,
          status: 'skipped',
          skipReason: 'invalid_phone',
        },
      });
      this.logger.log(`Shopify order ${shopifyOrderId}: invalid phone "${rawPhone}" — skipped`);
      return;
    }

    const existingCustomer = await this.prisma.customer.findFirst({
      where: { businessId: integration.businessId, phoneE164, isActive: true },
    });

    const customer = existingCustomer
      ? await this.prisma.customer.update({
          where: { id: existingCustomer.id },
          data: { name: customerName, ...(customerEmail ? { email: customerEmail } : {}) },
        })
      : await this.prisma.customer.create({
          data: {
            businessId: integration.businessId,
            name: customerName,
            phoneE164,
            email: customerEmail,
          },
        });

    if (customer.optedOut) {
      await this.prisma.shopifyOrder.create({
        data: {
          businessId: integration.businessId,
          integrationId: integration.id,
          shopifyOrderId,
          customerName,
          customerPhone: phoneE164,
          customerEmail,
          status: 'skipped',
          skipReason: 'opted_out',
        },
      });
      this.logger.log(`Shopify order ${shopifyOrderId}: customer opted out — skipped`);
      return;
    }

    const campaign = await this.prisma.campaign.findFirst({
      where: {
        businessId: integration.businessId,
        templateKind: 'post_service',
        status: 'ACTIVE',
      },
      orderBy: { createdAt: 'asc' },
    });

    const serviceEvent = await this.prisma.serviceEvent.create({
      data: {
        businessId: integration.businessId,
        customerId: customer.id,
        serviceType: 'Shopify order',
        eventAt: new Date(),
        createdVia: ServiceEventCreatedVia.api,
      },
    });

    const trackingToken = randomBytes(8).toString('base64url');
    const message = await this.prisma.message.create({
      data: {
        businessId: integration.businessId,
        customerId: customer.id,
        campaignId: campaign?.id ?? null,
        serviceEventId: serviceEvent.id,
        channel: MessageChannel.whatsapp,
        trackingToken,
        status: MessageStatus.queued,
      },
    });

    const delayMs = integration.delayHours * 60 * 60 * 1000;
    await this.reviewRequestQueue.enqueue(
      { messageId: message.id, customerId: customer.id, businessId: integration.businessId },
      delayMs,
    );

    await this.prisma.shopifyOrder.create({
      data: {
        businessId: integration.businessId,
        integrationId: integration.id,
        shopifyOrderId,
        customerName,
        customerPhone: phoneE164,
        customerEmail,
        status: 'scheduled',
        scheduledAt: new Date(Date.now() + delayMs),
      },
    });

    this.logger.log(
      `Shopify order ${shopifyOrderId}: review request scheduled in ${integration.delayHours}h for customer ${customer.id}`,
    );
  }
}
