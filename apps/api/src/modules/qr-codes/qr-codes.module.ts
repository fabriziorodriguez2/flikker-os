import { Module } from '@nestjs/common';
import { QrCodesController } from './qr-codes.controller';
import { QrCodesService } from './qr-codes.service';
import { QrCodesRepository } from './qr-codes.repository';
import { QrGeneratorService } from './qr-generator.service';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { BranchesModule } from '../branches/branches.module';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  imports: [CampaignsModule, BranchesModule],
  controllers: [QrCodesController],
  providers: [
    QrCodesService,
    QrCodesRepository,
    QrGeneratorService,
    RolesGuard,
  ],
  exports: [QrCodesService, QrCodesRepository],
})
export class QrCodesModule {}
