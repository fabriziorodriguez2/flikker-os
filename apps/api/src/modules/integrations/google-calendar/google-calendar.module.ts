import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { JobsModule } from '../../../jobs/jobs.module';
import { GoogleCalendarController } from './google-calendar.controller';
import { GoogleCalendarService } from './google-calendar.service';
import { GoogleCalendarOAuthService } from './google-calendar-oauth.service';
import { GoogleCalendarApiService } from './google-calendar-api.service';
import { GoogleCalendarParserService } from './google-calendar-parser.service';
import { GoogleCalendarSyncService } from './google-calendar-sync.service';
import { GoogleCalendarSyncWorker } from '../../../jobs/workers/google-calendar-sync.worker';
import { GoogleCalendarSendCheckWorker } from '../../../jobs/workers/google-calendar-send-check.worker';

@Module({
  imports: [PrismaModule, JobsModule],
  controllers: [GoogleCalendarController],
  providers: [
    GoogleCalendarService,
    GoogleCalendarOAuthService,
    GoogleCalendarApiService,
    GoogleCalendarParserService,
    GoogleCalendarSyncService,
    GoogleCalendarSyncWorker,
    GoogleCalendarSendCheckWorker,
  ],
  exports: [GoogleCalendarSyncService],
})
export class GoogleCalendarModule {}
