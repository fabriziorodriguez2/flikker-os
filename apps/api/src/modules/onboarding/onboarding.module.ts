import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { VisitSourcesModule } from '../visit-sources/visit-sources.module';
import { BenefitsModule } from '../benefits/benefits.module';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';

/**
 * Onboarding self-service. Reusa `VisitSourcesRepository` y
 * `BenefitsRepository` en vez de duplicar la creación del QR principal o el
 * bridge de beneficios — el onboarding orquesta, no reimplementa.
 */
@Module({
  imports: [PrismaModule, VisitSourcesModule, BenefitsModule],
  controllers: [OnboardingController],
  providers: [OnboardingService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
