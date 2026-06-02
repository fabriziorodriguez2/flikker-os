import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { WhatsAppBspService } from '../../jobs/whatsapp-bsp.service';

@Module({
  imports: [PrismaModule],
  controllers: [PublicController],
  providers: [PublicService, WhatsAppBspService],
})
export class PublicModule {}
