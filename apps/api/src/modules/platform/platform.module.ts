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
import { PlansModule } from '../plans/plans.module';
import { PublicModule } from '../public/public.module';

@Module({
  imports: [
    JwtModule.register({}),
    CustomersModule,
    CampaignsModule,
    JobsModule,
    ShopifyIntegrationModule,
    PlansModule,
    // Para armar el `/r/{token}` del mensaje de prueba de Test Lab con la
    // misma fuente de verdad que el recordatorio real.
    PublicModule,
  ],
  controllers: [PlatformController],
  providers: [PlatformService, PlatformRepository, AuditService],
})
export class PlatformModule {}
