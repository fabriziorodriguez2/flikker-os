import { Module } from '@nestjs/common';
import { JobsModule } from '../../jobs/jobs.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';
import { WhatsAppWebhookService } from './whatsapp-webhook.service';

@Module({
  imports: [PrismaModule, JobsModule],
  controllers: [WhatsAppWebhookController],
  providers: [WhatsAppWebhookService],
})
export class WebhooksModule {}
