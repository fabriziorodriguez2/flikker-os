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
            // Define qué experiencia se le muestra al cliente al abrir el
            // link del recordatorio — ver `FeedbackService.getByToken`.
            experienceVersion: true,
          },
        },
        customer: { select: { id: true } },
        feedbackResponses: { select: { id: true }, take: 1 },
      },
    });
  }

  /** La visita a la que atar el feedback del recordatorio (Check-in V2). */
  findLastVisit(businessId: string, customerId: string) {
    return this.prisma.visit.findFirst({
      where: { businessId, customerId },
      orderBy: { occurredAt: 'desc' },
      select: { id: true },
    });
  }

  /**
   * ¿ESTA visita puntual ya tiene su feedback interno? Es el chequeo que el
   * worker hace justo antes de mandar el recordatorio.
   *
   * Se pregunta por la visita que ORIGINÓ el mensaje, nunca por "la última
   * visita del cliente": si volvió en el medio, la visita más reciente es
   * otra y no tiene por qué cambiar la decisión de este recordatorio —
   * la opinión que se está pidiendo es la de la visita de hace una hora.
   */
  async hasFeedbackForVisit(visitId: string): Promise<boolean> {
    const feedback = await this.prisma.checkinFeedback.findUnique({
      where: { visitId },
      select: { id: true },
    });
    return feedback !== null;
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
