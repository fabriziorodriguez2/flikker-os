import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FeedbackRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMessageByToken(token: string) {
    return this.prisma.message.findUnique({
      where: { trackingToken: token },
      include: {
        business: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            defaultReviewRedirectUrl: true,
            googleBusinessProfileUrl: true,
          },
        },
        customer: { select: { id: true } },
        feedbackResponses: { select: { id: true }, take: 1 },
      },
    });
  }

  markClicked(messageId: string) {
    return this.prisma.message.update({
      where: { id: messageId },
      data: { clickedAt: new Date() },
    });
  }

  createFeedback(data: {
    businessId: string;
    messageId: string;
    customerId: string;
    score: number;
    comment?: string;
    redirectedToGoogle: boolean;
  }) {
    return this.prisma.feedbackResponse.create({ data });
  }
}
