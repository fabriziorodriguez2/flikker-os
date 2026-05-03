import { Module } from '@nestjs/common';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { CampaignsRepository } from './campaigns.repository';
import { CampaignStatsService } from './campaigns.stats.service';
import { BranchesModule } from '../branches/branches.module';
import { PlansModule } from '../plans/plans.module';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuditService } from '../../common/services/audit.service';

@Module({
  imports: [PlansModule, BranchesModule],
  controllers: [CampaignsController],
  providers: [
    CampaignsService,
    CampaignsRepository,
    CampaignStatsService,
    RolesGuard,
    AuditService,
  ],
  exports: [CampaignsService, CampaignsRepository, CampaignStatsService],
})
export class CampaignsModule {}
