import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OwnerNotificationsQueue } from './owner-notifications.queue';
import { GoogleReviewDetectionQueue } from './google-review-detection.queue';
import { GoogleReviewsProvider } from './google-reviews.provider';
import { RepeatsQueue } from './repeats.queue';
import { ReviewRequestQueue } from './review-request.queue';
import { WhatsAppInboundQueue } from './whatsapp-inbound.queue';
import { GoogleReviewDetectionWorker } from './workers/google-review-detection.worker';
import { WhatsAppInboundWorker } from './workers/whatsapp-inbound.worker';
import { OwnerNotificationsWorker } from './workers/owner-notifications.worker';
import { RepeatsWorker } from './workers/repeats.worker';
import { ReviewRequestWorker } from './workers/review-request.worker';
import { WhatsAppBspService } from './whatsapp-bsp.service';
import { EmailService } from './email.service';
import { RepeatsProcessor } from './repeats.processor';

@Module({
  imports: [PrismaModule],
  providers: [
    ReviewRequestQueue,
    RepeatsQueue,
    GoogleReviewDetectionQueue,
    OwnerNotificationsQueue,
    WhatsAppInboundQueue,
    GoogleReviewsProvider,
    OwnerNotificationsWorker,
    GoogleReviewDetectionWorker,
    RepeatsProcessor,
    RepeatsWorker,
    WhatsAppInboundWorker,
    ReviewRequestWorker,
    WhatsAppBspService,
    EmailService,
  ],
  exports: [
    ReviewRequestQueue,
    WhatsAppInboundQueue,
    OwnerNotificationsQueue,
    GoogleReviewDetectionQueue,
    GoogleReviewsProvider,
    WhatsAppBspService,
    EmailService,
  ],
})
export class JobsModule {}
