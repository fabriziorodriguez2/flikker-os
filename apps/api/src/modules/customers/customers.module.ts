import { Module } from '@nestjs/common';
import { WhatsAppBspService } from '../../jobs/whatsapp-bsp.service';
import { ContactsController, CustomersController } from './customers.controller';
import { CustomersRepository } from './customers.repository';
import { CustomersService } from './customers.service';

@Module({
  controllers: [CustomersController, ContactsController],
  providers: [CustomersService, CustomersRepository, WhatsAppBspService],
  exports: [CustomersService, CustomersRepository],
})
export class CustomersModule {}
