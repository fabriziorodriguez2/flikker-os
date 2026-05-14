import { Module } from '@nestjs/common';
import { BusinessesController } from './businesses.controller';
import { BusinessesService } from './businesses.service';
import { BusinessesRepository } from './businesses.repository';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuditService } from '../../common/services/audit.service';
import { JobsModule } from '../../jobs/jobs.module';

@Module({
  imports: [JobsModule],
  controllers: [BusinessesController],
  providers: [
    BusinessesService,
    BusinessesRepository,
    TenantGuard,
    RolesGuard,
    AuditService,
  ],
  exports: [BusinessesService, BusinessesRepository],
})
export class BusinessesModule {}
