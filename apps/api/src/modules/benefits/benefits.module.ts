import { Module } from '@nestjs/common';
import { ProgramAuditModule } from '../program-audit/program-audit.module';
import { RetentionV2Module } from '../retention-v2/retention-v2.module';
import { BenefitsController } from './benefits.controller';
import { BenefitsRepository } from './benefits.repository';
import { BenefitsService } from './benefits.service';

@Module({
  imports: [ProgramAuditModule, RetentionV2Module],
  controllers: [BenefitsController],
  providers: [BenefitsService, BenefitsRepository],
  exports: [BenefitsService, BenefitsRepository],
})
export class BenefitsModule {}
