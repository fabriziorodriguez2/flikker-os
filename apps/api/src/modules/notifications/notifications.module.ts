import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { BenefitsModule } from '../benefits/benefits.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { CustomersModule } from '../customers/customers.module';
import { RetentionV2Module } from '../retention-v2/retention-v2.module';
import { ProgramAuditModule } from '../program-audit/program-audit.module';
import { VisitSourcesModule } from '../visit-sources/visit-sources.module';
import { WhatsAppBspService } from '../../jobs/whatsapp-bsp.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsPromotionsService } from './notifications-promotions.service';

/**
 * Notificaciones no tiene dominio propio: importa los cuatro sistemas que ya
 * existen y los presenta como una sola sección.
 *
 *  - RetentionV2  → los flags reales y los resultados con grupo de control
 *  - Customers    → las audiencias, que son los MISMOS filtros de la lista
 *  - Campaigns    → el envío manual, que ya funcionaba
 *  - Benefits     → el catálogo, que sigue siendo de Programa
 *
 * Que no haya un repositorio acá es la señal de que la fachada es fachada.
 */
@Module({
  imports: [
    PrismaModule,
    RetentionV2Module,
    CustomersModule,
    CampaignsModule,
    BenefitsModule,
    // Para el link del acceso: la promoción con beneficio manda al MISMO
    // destino que el QR del mostrador, no a uno propio.
    VisitSourcesModule,
    // Historial de "cambiaste el límite mensual de beneficios automáticos".
    ProgramAuditModule,
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsPromotionsService,
    // Instancia propia, como en jobs/retention-v2/public/customers modules
    // — es stateless, no hace falta compartirla vía export.
    WhatsAppBspService,
  ],
  // Inicio reusa el overview de automatizaciones para no redefinir los flags.
  exports: [NotificationsService],
})
export class NotificationsModule {}
