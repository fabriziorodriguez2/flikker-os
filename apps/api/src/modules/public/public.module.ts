import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { WhatsAppBspService } from '../../jobs/whatsapp-bsp.service';
import { ReviewRequestQueue } from '../../jobs/review-request.queue';

@Module({
  imports: [PrismaModule],
  controllers: [PublicController],
  providers: [PublicService, WhatsAppBspService, ReviewRequestQueue],
})
export class PublicModule {}
