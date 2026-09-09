import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';
import { PublicMessagingService } from './public-messaging.service';
import { CustomerPublicUrlService } from './customer-public-url.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { WhatsAppBspService } from '../../jobs/whatsapp-bsp.service';
import { ReviewRequestQueue } from '../../jobs/review-request.queue';
import { BenefitsModule } from '../benefits/benefits.module';
import { VisitSourcesModule } from '../visit-sources/visit-sources.module';

@Module({
  imports: [PrismaModule, BenefitsModule, VisitSourcesModule],
  controllers: [PublicController],
  providers: [
    PublicService,
    PublicMessagingService,
    CustomerPublicUrlService,
    WhatsAppBspService,
    ReviewRequestQueue,
  ],
  exports: [PublicMessagingService, CustomerPublicUrlService],
})
export class PublicModule {}
