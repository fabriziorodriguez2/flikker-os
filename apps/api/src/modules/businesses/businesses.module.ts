import { Module } from '@nestjs/common';
import { BusinessesController } from './businesses.controller';
import { BusinessesService } from './businesses.service';
import { BusinessesRepository } from './businesses.repository';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuditService } from '../../common/services/audit.service';
import { JobsModule } from '../../jobs/jobs.module';
import { PlansModule } from '../plans/plans.module';
import { CheckoutLeadsService } from '../public/checkout-leads.service';
import { MercadoPagoSubscriptionProvider } from '../public/mercado-pago-subscription.provider';

@Module({
  imports: [JobsModule, PlansModule],
  controllers: [BusinessesController],
  providers: [
    BusinessesService,
    BusinessesRepository,
    TenantGuard,
    RolesGuard,
    AuditService,
    // Checkout Pro autenticado (Parte 5) — sin estado propio, seguro de
    // instanciar también acá sin importar todo `PublicModule` (que trae
    // Benefits/VisitSources, sin relación con esto).
    CheckoutLeadsService,
    MercadoPagoSubscriptionProvider,
  ],
  exports: [BusinessesService, BusinessesRepository],
})
export class BusinessesModule {}
