import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OwnerNotificationsQueue } from '../../jobs/owner-notifications.queue';
import { SubmitFeedbackDto } from './dto/submit-feedback.dto';
import { FeedbackRepository } from './feedback.repository';

@Injectable()
export class FeedbackService {
  constructor(
    private readonly feedbackRepository: FeedbackRepository,
    private readonly ownerNotificationsQueue: OwnerNotificationsQueue,
  ) {}

  async getByToken(token: string) {
    const message = await this.feedbackRepository.findMessageByToken(token);
    if (!message || message.feedbackResponses.length > 0) {
      throw new NotFoundException();
    }

    const googleReviewUrl =
      message.business.defaultReviewRedirectUrl ??
      message.business.googleBusinessProfileUrl;
    if (!googleReviewUrl) throw new NotFoundException();

    await this.feedbackRepository.markClicked(message.id);

    return {
      businessName: message.business.name,
      businessLogo: message.business.logoUrl,
      googleReviewUrl,
    };
  }

  async submit(token: string, dto: SubmitFeedbackDto) {
    if (!Number.isInteger(dto.score) || dto.score < 1 || dto.score > 5) {
      throw new BadRequestException('score must be between 1 and 5');
    }

    const message = await this.feedbackRepository.findMessageByToken(token);
    if (!message) throw new NotFoundException();
    if (message.feedbackResponses.length > 0) {
      throw new ConflictException('Feedback already submitted');
    }

    const feedback = await this.feedbackRepository.createFeedback({
      businessId: message.businessId,
      messageId: message.id,
      customerId: message.customerId,
      score: dto.score,
      comment: dto.comment?.trim() || undefined,
      redirectedToGoogle: dto.score >= 4,
    });

    if (dto.score < 4) {
      await this.ownerNotificationsQueue.enqueueLowFeedback({
        businessId: message.businessId,
        feedbackResponseId: feedback.id,
      });
    }

    return {
      ok: true,
      redirectedToGoogle: feedback.redirectedToGoogle,
    };
  }
}
