import { Module } from '@nestjs/common';
import { ReviewsModule } from '../reviews/reviews.module';
import { ResponsesController } from './responses.controller';
import { ResponsesRepository } from './responses.repository';
import { ResponsesService } from './responses.service';

@Module({
  imports: [ReviewsModule],
  controllers: [ResponsesController],
  providers: [ResponsesService, ResponsesRepository],
  exports: [ResponsesService, ResponsesRepository],
})
export class ResponsesModule {}
