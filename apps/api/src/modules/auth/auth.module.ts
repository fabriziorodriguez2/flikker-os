import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthRepository } from './auth.repository';
import { PreOnboardingCheckoutService } from './pre-onboarding-checkout.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { EmailService } from '../../jobs/email.service';
import { WhatsAppBspService } from '../../jobs/whatsapp-bsp.service';
import { PlansModule } from '../plans/plans.module';
import { DomainEventsModule } from '../domain-events/domain-events.module';
import { CheckoutLeadsService } from '../public/checkout-leads.service';
import { MercadoPagoSubscriptionProvider } from '../public/mercado-pago-subscription.provider';
import { MercadoPagoWebhookService } from '../webhooks/mercado-pago-webhook.service';
import { SubscriptionPaidNotificationService } from '../webhooks/subscription-paid-notification.service';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({}),
    PlansModule,
    DomainEventsModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthRepository,
    JwtStrategy,
    EmailService,
    WhatsAppBspService,
    PreOnboardingCheckoutService,
    // Checkout Pro pre-onboarding (Parte 5D) — sin estado propio, seguro de
    // instanciar acá también en vez de importar `PublicModule`/`WebhooksModule`
    // enteros (mismo patrón ya usado por BusinessesModule/WebhooksModule).
    CheckoutLeadsService,
    MercadoPagoSubscriptionProvider,
    MercadoPagoWebhookService,
    SubscriptionPaidNotificationService,
  ],
  exports: [AuthService, AuthRepository],
})
export class AuthModule {}
