import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { JobsModule } from '../../../jobs/jobs.module';
import { ShopifyHmacService } from './shopify-hmac.service';
import { ShopifyWebhookService } from './shopify-webhook.service';
import { ShopifyWebhookController } from './shopify-webhook.controller';
import { ShopifyConfigService } from './shopify-config.service';
import { ShopifyConfigController } from './shopify-config.controller';

@Module({
  imports: [PrismaModule, JobsModule],
  controllers: [ShopifyWebhookController, ShopifyConfigController],
  providers: [ShopifyHmacService, ShopifyWebhookService, ShopifyConfigService],
  exports: [ShopifyConfigService],
})
export class ShopifyIntegrationModule {}
