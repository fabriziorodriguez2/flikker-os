import { MessageStatus } from '@prisma/client';
import { GoogleReviewDetectionWorker } from './google-review-detection.worker';

describe('GoogleReviewDetectionWorker', () => {
  it('continues with the next business when the provider fails for one business', async () => {
    const prisma = {
      business: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'business-error',
            googlePlaceId: 'place-error',
          },
          {
            id: 'business-ok',
            googlePlaceId: 'place-ok',
          },
        ]),
      },
      googleReview: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'google-review-1' }),
      },
      message: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const provider = {
      fetchReviews: jest
        .fn()
        .mockRejectedValueOnce(new Error('Google API unavailable'))
        .mockResolvedValueOnce([
          {
            googleReviewId: 'review-1',
            reviewerName: 'Maria Garcia',
            stars: 5,
            text: 'Muy buena atencion',
            postedAt: new Date('2026-05-03T10:00:00.000Z'),
          },
        ]),
    };
    const worker = new GoogleReviewDetectionWorker(
      prisma as never,
      provider as never,
    );

    await expect(worker.runDaily()).resolves.toEqual({
      businesses: 2,
      created: 1,
      failed: 1,
    });

    expect(provider.fetchReviews).toHaveBeenCalledTimes(2);
    expect(provider.fetchReviews).toHaveBeenNthCalledWith(2, {
      businessId: 'business-ok',
      googlePlaceId: 'place-ok',
    });
    expect(prisma.googleReview.create).toHaveBeenCalledWith({
      data: {
        businessId: 'business-ok',
        googleReviewId: 'review-1',
        reviewerName: 'Maria Garcia',
        stars: 5,
        text: 'Muy buena atencion',
        postedAt: new Date('2026-05-03T10:00:00.000Z'),
        attributedMessageId: null,
      },
    });
  });

  it('attributes a new review to the most recent matching sent message', async () => {
    const postedAt = new Date('2026-05-03T10:00:00.000Z');
    const prisma = {
      business: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'business-1',
            googlePlaceId: 'place-1',
          },
        ]),
      },
      googleReview: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'google-review-1' }),
      },
      message: {
        findFirst: jest.fn().mockResolvedValue({ id: 'message-1' }),
      },
    };
    const provider = {
      fetchReviews: jest.fn().mockResolvedValue([
        {
          googleReviewId: 'review-1',
          reviewerName: 'Maria',
          stars: 4,
          text: null,
          postedAt,
        },
      ]),
    };
    const worker = new GoogleReviewDetectionWorker(
      prisma as never,
      provider as never,
    );

    await worker.runDaily();

    expect(prisma.message.findFirst).toHaveBeenCalledWith({
      where: {
        businessId: 'business-1',
        status: {
          in: [MessageStatus.sent, MessageStatus.delivered, MessageStatus.read],
        },
        sentAt: {
          gte: new Date('2026-04-26T10:00:00.000Z'),
          lte: postedAt,
        },
        customer: {
          name: {
            contains: 'Maria',
            mode: 'insensitive',
          },
        },
      },
      orderBy: {
        sentAt: 'desc',
      },
      select: {
        id: true,
      },
    });
    expect(prisma.googleReview.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        attributedMessageId: 'message-1',
      }),
    });
  });
});
