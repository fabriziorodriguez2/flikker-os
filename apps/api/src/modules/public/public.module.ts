import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';
import { PublicMessagingService } from './public-messaging.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { WhatsAppBspService } from '../../jobs/whatsapp-bsp.service';
import { ReviewRequestQueue } from '../../jobs/review-request.queue';
import { BenefitsModule } from '../benefits/benefits.module';

@Module({
  imports: [PrismaModule, BenefitsModule],
  controllers: [PublicController],
  providers: [
    PublicService,
    PublicMessagingService,
    WhatsAppBspService,
    ReviewRequestQueue,
  ],
  exports: [PublicMessagingService],
})
export class PublicModule {}
