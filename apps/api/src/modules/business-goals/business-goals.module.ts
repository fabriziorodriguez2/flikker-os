import { Module } from '@nestjs/common';
import { BusinessGoalsController } from './business-goals.controller';
import { BusinessGoalsRepository } from './business-goals.repository';
import { BusinessGoalsService } from './business-goals.service';

@Module({
  controllers: [BusinessGoalsController],
  providers: [BusinessGoalsService, BusinessGoalsRepository],
  exports: [BusinessGoalsService, BusinessGoalsRepository],
})
export class BusinessGoalsModule {}
