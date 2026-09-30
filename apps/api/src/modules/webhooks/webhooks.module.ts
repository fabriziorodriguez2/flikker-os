import { Module } from '@nestjs/common';
import { JobsModule } from '../../jobs/jobs.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';
import { WhatsAppWebhookService } from './whatsapp-webhook.service';
import { WaSenderWebhookController } from './wasender-webhook.controller';
import { WaSenderWebhookService } from './wasender-webhook.service';
import { MercadoPagoWebhookController } from './mercado-pago-webhook.controller';
import { MercadoPagoWebhookService } from './mercado-pago-webhook.service';
import { MercadoPagoSubscriptionProvider } from '../public/mercado-pago-subscription.provider';

@Module({
  imports: [PrismaModule, JobsModule],
  // WHAPI y WaSenderAPI conviven — ver `## Feature flag/cutover`. Ninguno
  // reemplaza al otro todavía.
  controllers: [
    WhatsAppWebhookController,
    WaSenderWebhookController,
    MercadoPagoWebhookController,
  ],
  providers: [
    WhatsAppWebhookService,
    WaSenderWebhookService,
    MercadoPagoWebhookService,
    // Sin estado propio (lee env/hace fetch) — seguro de instanciar acá
    // también, sin necesidad de importar todo `PublicModule`.
    MercadoPagoSubscriptionProvider,
  ],
})
export class WebhooksModule {}
