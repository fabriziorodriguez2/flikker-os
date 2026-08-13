import { Module } from '@nestjs/common';
import { WhatsAppBspService } from '../../jobs/whatsapp-bsp.service';
import {
  ContactsController,
  CustomersController,
} from './customers.controller';
import { CustomersRepository } from './customers.repository';
import { CustomersService } from './customers.service';
import { CustomerLoyaltyRepository } from './loyalty/customer-loyalty.repository';
import { CustomerLoyaltyService } from './loyalty/customer-loyalty.service';
import { CustomerOverviewService } from './loyalty/customer-overview.service';

@Module({
  controllers: [CustomersController, ContactsController],
  providers: [
    CustomersService,
    CustomersRepository,
    WhatsAppBspService,
    // Pantalla de fidelización. Vive en este módulo y no en uno propio porque
    // es la misma entidad vista de otra forma, no un dominio nuevo.
    CustomerLoyaltyRepository,
    CustomerLoyaltyService,
    CustomerOverviewService,
  ],
  // `CustomerLoyaltyService` se exporta para que Notificaciones resuelva las
  // audiencias de una promoción con los MISMOS filtros que ve el dueño en la
  // lista de Clientes, en vez de reimplementarlos.
  exports: [CustomersService, CustomersRepository, CustomerLoyaltyService],
})
export class CustomersModule {}
