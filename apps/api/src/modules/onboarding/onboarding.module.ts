import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { VisitSourcesModule } from '../visit-sources/visit-sources.module';
import { BenefitsModule } from '../benefits/benefits.module';
import { RetentionV2Module } from '../retention-v2/retention-v2.module';
import { PlansModule } from '../plans/plans.module';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';

/**
 * Onboarding self-service. Reusa `VisitSourcesRepository`,
 * `BenefitsRepository` y `RetentionV2BootstrapService` en vez de duplicar la
 * creación del QR principal, el bridge de beneficios o la infraestructura de
 * Retention V2 — el onboarding orquesta, no reimplementa. `PlansModule` es
 * nuevo: es la única puerta de entrada self-service que da de alta el plan
 * FREE (sellos) o el trial de 30 días (Beneficios).
 */
@Module({
  imports: [
    PrismaModule,
    VisitSourcesModule,
    BenefitsModule,
    RetentionV2Module,
    PlansModule,
  ],
  controllers: [OnboardingController],
  providers: [OnboardingService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
