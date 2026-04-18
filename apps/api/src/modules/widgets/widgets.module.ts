import { Module } from '@nestjs/common';
import { WidgetsController } from './widgets.controller';
import { WidgetsPublicController } from './widgets-public.controller';
import { WidgetsRepository } from './widgets.repository';
import { WidgetsService } from './widgets.service';

@Module({
  controllers: [WidgetsController, WidgetsPublicController],
  providers: [WidgetsService, WidgetsRepository],
  exports: [WidgetsService, WidgetsRepository],
})
export class WidgetsModule {}
