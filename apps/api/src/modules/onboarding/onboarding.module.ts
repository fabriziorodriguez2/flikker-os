import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { VisitSourcesModule } from '../visit-sources/visit-sources.module';
import { BenefitsModule } from '../benefits/benefits.module';
import { RetentionV2Module } from '../retention-v2/retention-v2.module';
import { PlansModule } from '../plans/plans.module';
import { DomainEventsModule } from '../domain-events/domain-events.module';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { RegistrationCompletedService } from './registration-completed.service';
import { EmailService } from '../../jobs/email.service';
import { WhatsAppBspService } from '../../jobs/whatsapp-bsp.service';
import { SubscriptionPaidNotificationService } from '../webhooks/subscription-paid-notification.service';

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
    DomainEventsModule,
  ],
  controllers: [OnboardingController],
  providers: [
    OnboardingService,
    RegistrationCompletedService,
    // Sin estado propio — seguro de instanciar también acá sin importar
    // todo `JobsModule` (que trae una cadena enorme de colas/workers sin
    // relación con onboarding).
    EmailService,
    WhatsAppBspService,
    // Parte 5D — dispara SUBSCRIPTION_PAID cuando el onboarding asocia un
    // CheckoutLead pre-onboarding ya pagado. Sin estado propio.
    SubscriptionPaidNotificationService,
  ],
  exports: [OnboardingService],
})
export class OnboardingModule {}
