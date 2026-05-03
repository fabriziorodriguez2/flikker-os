import { Module } from '@nestjs/common';
import { JobsModule } from '../../jobs/jobs.module';
import { ServiceEventsController } from './service-events.controller';
import { ServiceEventsRepository } from './service-events.repository';
import { ServiceEventsService } from './service-events.service';

@Module({
  imports: [JobsModule],
  controllers: [ServiceEventsController],
  providers: [ServiceEventsService, ServiceEventsRepository],
})
export class ServiceEventsModule {}
