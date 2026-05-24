import {
  Controller,
  Post,
  Headers,
  Req,
  HttpCode,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { ShopifyHmacService } from './shopify-hmac.service';
import { ShopifyWebhookService } from './shopify-webhook.service';
import { PrismaService } from '../../../prisma/prisma.service';
import type { ShopifyOrderWebhookDto } from './dto/shopify-order-webhook.dto';

@Controller('integrations/shopify/webhooks')
export class ShopifyWebhookController {
  private readonly logger = new Logger(ShopifyWebhookController.name);

  constructor(
    private readonly hmacService: ShopifyHmacService,
    private readonly webhookService: ShopifyWebhookService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('orders')
  @HttpCode(200)
  async receiveOrder(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-shopify-hmac-sha256') hmacHeader: string | undefined,
    @Headers('x-shopify-shop-domain') shopDomain: string | undefined,
  ) {
    if (!shopDomain) {
      throw new UnauthorizedException('Missing shop domain header');
    }

    const integration = await this.prisma.shopifyIntegration.findUnique({
      where: { shopDomain },
      select: { webhookSecret: true, isActive: true },
    });

    if (!integration) {
      this.logger.warn(`Webhook received for unknown shop: ${shopDomain}`);
      return { ok: true };
    }

    if (!hmacHeader || !req.rawBody) {
      throw new UnauthorizedException('Missing HMAC signature');
    }

    const valid = this.hmacService.verify(req.rawBody, hmacHeader, integration.webhookSecret);
    if (!valid) {
      this.logger.warn(`Invalid HMAC for shop: ${shopDomain}`);
      throw new UnauthorizedException('Invalid HMAC signature');
    }

    const order = req.body as ShopifyOrderWebhookDto;

    void this.webhookService.processOrder(shopDomain, order).catch((err: unknown) => {
      this.logger.error(
        `Shopify order processing failed for shop ${shopDomain}`,
        err instanceof Error ? err.stack : String(err),
      );
    });

    return { ok: true };
  }
}
