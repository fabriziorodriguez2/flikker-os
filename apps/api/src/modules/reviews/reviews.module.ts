import { Module } from '@nestjs/common';
import { ReviewsController } from './reviews.controller';
import { ReviewTagsController } from './review-tags.controller';
import { ReviewsService } from './reviews.service';
import { ReviewsRepository } from './reviews.repository';
import { ReviewsOverviewService } from './reviews-overview.service';
import { ReviewTagsService } from './review-tags.service';
import { ReviewTagsRepository } from './review-tags.repository';
import { CampaignsModule } from '../campaigns/campaigns.module';

@Module({
  imports: [CampaignsModule],
  controllers: [ReviewTagsController, ReviewsController],
  providers: [
    ReviewsService,
    ReviewsRepository,
    ReviewsOverviewService,
    ReviewTagsService,
    ReviewTagsRepository,
  ],
  // Inicio muestra rating y resenas nuevas con la MISMA definicion que Resenas.
  exports: [ReviewsService, ReviewsRepository, ReviewsOverviewService],
})
export class ReviewsModule {}
