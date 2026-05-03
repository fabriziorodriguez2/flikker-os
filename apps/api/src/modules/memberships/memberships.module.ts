import { Module } from '@nestjs/common';
import { MembershipsController } from './memberships.controller';
import { MembershipsService } from './memberships.service';
import { MembershipsRepository } from './memberships.repository';
import { PlansModule } from '../plans/plans.module';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuditService } from '../../common/services/audit.service';

@Module({
  imports: [PlansModule],
  controllers: [MembershipsController],
  providers: [
    MembershipsService,
    MembershipsRepository,
    RolesGuard,
    AuditService,
  ],
  exports: [MembershipsService, MembershipsRepository],
})
export class MembershipsModule {}
