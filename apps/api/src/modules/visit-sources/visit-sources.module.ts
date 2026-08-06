import { Module } from '@nestjs/common';
import { VisitSourcesController } from './visit-sources.controller';
import { VisitSourcesRepository } from './visit-sources.repository';
import { VisitSourcesService } from './visit-sources.service';

@Module({
  controllers: [VisitSourcesController],
  providers: [VisitSourcesService, VisitSourcesRepository],
  exports: [VisitSourcesService, VisitSourcesRepository],
})
export class VisitSourcesModule {}
