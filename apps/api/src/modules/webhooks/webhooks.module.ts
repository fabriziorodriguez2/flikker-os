import { Module } from '@nestjs/common';
import { JobsModule } from '../../jobs/jobs.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';
import { WhatsAppWebhookService } from './whatsapp-webhook.service';
import { WaSenderWebhookController } from './wasender-webhook.controller';
import { WaSenderWebhookService } from './wasender-webhook.service';

@Module({
  imports: [PrismaModule, JobsModule],
  // WHAPI y WaSenderAPI conviven — ver `## Feature flag/cutover`. Ninguno
  // reemplaza al otro todavía.
  controllers: [WhatsAppWebhookController, WaSenderWebhookController],
  providers: [WhatsAppWebhookService, WaSenderWebhookService],
})
export class WebhooksModule {}
