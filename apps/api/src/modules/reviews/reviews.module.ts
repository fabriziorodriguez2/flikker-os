import { Module } from '@nestjs/common';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { ReviewsRepository } from './reviews.repository';
import { ReviewTagsService } from './review-tags.service';
import { ReviewTagsRepository } from './review-tags.repository';
import { CampaignsModule } from '../campaigns/campaigns.module';

@Module({
  imports: [CampaignsModule],
  controllers: [ReviewsController],
  providers: [
    ReviewsService,
    ReviewsRepository,
    ReviewTagsService,
    ReviewTagsRepository,
  ],
  exports: [ReviewsService, ReviewsRepository],
})
export class ReviewsModule {}
