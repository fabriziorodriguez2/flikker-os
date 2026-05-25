import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';
import { PlatformRepository } from './platform.repository';
import { AuditService } from '../../common/services/audit.service';
import { CustomersModule } from '../customers/customers.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { JobsModule } from '../../jobs/jobs.module';
import { ShopifyIntegrationModule } from '../integrations/shopify/shopify-integration.module';

@Module({
  imports: [
    JwtModule.register({}),
    CustomersModule,
    CampaignsModule,
    JobsModule,
    ShopifyIntegrationModule,
  ],
  controllers: [PlatformController],
  providers: [PlatformService, PlatformRepository, AuditService],
})
export class PlatformModule {}
