import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CustomersModule } from '../customers/customers.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { BenefitsModule } from '../benefits/benefits.module';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';

/**
 * Inicio no tiene dominio: importa a los dueños de cada métrica para que los
 * números de la portada sean literalmente los mismos que los de su sección.
 */
@Module({
  imports: [
    PrismaModule,
    CustomersModule,
    NotificationsModule,
    ReviewsModule,
    BenefitsModule,
  ],
  controllers: [HomeController],
  providers: [HomeService],
})
export class HomeModule {}
