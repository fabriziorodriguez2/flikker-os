import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OwnerNotificationsQueue } from './owner-notifications.queue';
import { GoogleReviewDetectionQueue } from './google-review-detection.queue';
import { GoogleReviewsProvider } from './google-reviews.provider';
import { RepeatsQueue } from './repeats.queue';
import { RetentionQueue } from './retention.queue';
import { ReviewRequestQueue } from './review-request.queue';
import { WhatsAppInboundQueue } from './whatsapp-inbound.queue';
import { GoogleCalendarSyncQueue } from './google-calendar-sync.queue';
import { GoogleCalendarSendCheckQueue } from './google-calendar-send-check.queue';
import { GoogleReviewDetectionWorker } from './workers/google-review-detection.worker';
import { WhatsAppInboundWorker } from './workers/whatsapp-inbound.worker';
import { OwnerNotificationsWorker } from './workers/owner-notifications.worker';
import { RepeatsWorker } from './workers/repeats.worker';
import { RetentionWorker } from './workers/retention.worker';
import { ReviewRequestWorker } from './workers/review-request.worker';
import { WhatsAppBspService } from './whatsapp-bsp.service';
import { EmailService } from './email.service';
import { RepeatsProcessor } from './repeats.processor';
import { RetentionProcessor } from './retention.processor';

@Module({
  imports: [PrismaModule],
  providers: [
    ReviewRequestQueue,
    RepeatsQueue,
    RetentionQueue,
    GoogleReviewDetectionQueue,
    OwnerNotificationsQueue,
    WhatsAppInboundQueue,
    GoogleCalendarSyncQueue,
    GoogleCalendarSendCheckQueue,
    GoogleReviewsProvider,
    OwnerNotificationsWorker,
    GoogleReviewDetectionWorker,
    RepeatsProcessor,
    RepeatsWorker,
    RetentionProcessor,
    RetentionWorker,
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
    GoogleCalendarSyncQueue,
    GoogleCalendarSendCheckQueue,
    GoogleReviewsProvider,
    WhatsAppBspService,
    EmailService,
  ],
})
export class JobsModule {}
