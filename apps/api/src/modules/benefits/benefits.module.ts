import { Module } from '@nestjs/common';
import { BenefitsController } from './benefits.controller';
import { BenefitsRepository } from './benefits.repository';
import { BenefitsService } from './benefits.service';

@Module({
  controllers: [BenefitsController],
  providers: [BenefitsService, BenefitsRepository],
  exports: [BenefitsService, BenefitsRepository],
})
export class BenefitsModule {}
