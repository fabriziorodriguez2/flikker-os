import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ExperienceVersion } from '@prisma/client';
import { OwnerNotificationsQueue } from '../../jobs/owner-notifications.queue';
import { RewardGoalFeedbackService } from '../reward-goals/reward-goal-feedback.service';
import { SubmitFeedbackDto } from './dto/submit-feedback.dto';
import { FeedbackRepository } from './feedback.repository';

@Injectable()
export class FeedbackService {
  constructor(
    private readonly feedbackRepository: FeedbackRepository,
    private readonly ownerNotificationsQueue: OwnerNotificationsQueue,
    private readonly rewardGoalFeedback: RewardGoalFeedbackService,
  ) {}

  /**
   * Resuelve el link del recordatorio (`/r/{trackingToken}`).
   *
   * Dos causas de 404 confirmadas en producción, las dos SOLO para
   * Check-in V2 (auditoría de caso real):
   *
   *  1. El negocio no tiene Google conectado. El landing viejo existía
   *     únicamente para redirigir a Google, así que sin esa URL devolvía
   *     404. En V2 el feedback interno vale por sí solo y Google es un paso
   *     opcional aparte, así que ya no puede ser motivo de 404.
   *  2. El cliente ya había dejado feedback. Volver a tocar el mismo
   *     WhatsApp devolvía 404, como si el link estuviera roto. En V2 se
   *     responde `alreadySubmitted` y la pantalla lo agradece.
   *
   * LEGACY conserva EXACTAMENTE los dos 404 de antes: su landing sigue
   * dependiendo de Google y sigue siendo de un solo uso.
   */
  async getByToken(token: string) {
    const message = await this.feedbackRepository.findMessageByToken(token);
    if (!message) throw new NotFoundException();

    const isCheckinV2 =
      message.business.experienceVersion === ExperienceVersion.CHECKIN_V2;
    const alreadySubmitted = message.feedbackResponses.length > 0;
    const googleReviewUrl =
      message.business.defaultReviewRedirectUrl ??
      message.business.googleBusinessProfileUrl;

    if (!isCheckinV2) {
      if (alreadySubmitted || !googleReviewUrl) throw new NotFoundException();
    }

    await this.feedbackRepository.markClicked(message.id);

    return {
      businessName: message.business.name,
      businessLogo: message.business.logoUrl,
      // `null` solo es posible en V2 — la pantalla oculta el paso de Google
      // en vez de ofrecer un link roto.
      googleReviewUrl: googleReviewUrl ?? null,
      experienceVersion: message.business.experienceVersion,
      alreadySubmitted,
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

    const isCheckinV2 =
      message.business.experienceVersion === ExperienceVersion.CHECKIN_V2;

    const feedback = await this.feedbackRepository.createFeedback({
      businessId: message.businessId,
      messageId: message.id,
      customerId: message.customerId,
      score: dto.score,
      comment: dto.comment?.trim() || undefined,
      // En V2 este campo deja de significar "le ofrecimos Google": Google se
      // ofrece SIEMPRE, con cualquier puntaje (nada de selective
      // solicitation). LEGACY conserva su semántica anterior intacta.
      redirectedToGoogle: isCheckinV2 ? false : dto.score >= 4,
    });

    // El sello extra es por completar el FEEDBACK, nunca por ir a Google, y
    // se persiste ACÁ — antes de que el cliente navegue a ningún lado. Si
    // cierra Google o no publica nada, el sello ya quedó. Es el mismo
    // servicio (y la misma idempotencia por `feedbackId`) que usa la card
    // del check-in, así que no hay dos formas de otorgarlo.
    let bonusGranted = false;
    if (isCheckinV2) {
      bonusGranted = await this.grantStampForFeedback(
        message.businessId,
        message.customerId,
        dto.score,
        dto.comment,
      );
    }

    if (dto.score < 4) {
      void this.ownerNotificationsQueue
        .enqueueLowFeedback({
          businessId: message.businessId,
          feedbackResponseId: feedback.id,
        })
        .catch(() => undefined);
    }

    const googleReviewUrl =
      message.business.defaultReviewRedirectUrl ??
      message.business.googleBusinessProfileUrl;

    return {
      ok: true,
      redirectedToGoogle: feedback.redirectedToGoogle,
      bonusGranted,
      // Se ofrece con CUALQUIER puntaje; lo único que lo apaga es que el
      // negocio no tenga Google conectado.
      offerGoogle: isCheckinV2 ? Boolean(googleReviewUrl) : undefined,
    };
  }

  /**
   * Traduce el feedback del recordatorio al mundo de Check-in V2: lo ata a
   * la última visita real del cliente y deja que `RewardGoalFeedbackService`
   * decida el sello con sus reglas de siempre (independiente del puntaje,
   * solo si el negocio lo tiene activo, una sola vez por visita).
   *
   * Best-effort: si no hay visita a la que atarlo, el feedback igual quedó
   * guardado — nunca se pierde la opinión por no poder dar el sello.
   */
  private async grantStampForFeedback(
    businessId: string,
    customerId: string,
    score: number,
    comment?: string,
  ): Promise<boolean> {
    try {
      const lastVisit = await this.feedbackRepository.findLastVisit(
        businessId,
        customerId,
      );
      if (!lastVisit) return false;

      const result = await this.rewardGoalFeedback.submit(
        businessId,
        customerId,
        lastVisit.id,
        score,
        comment?.trim() || undefined,
      );
      return result.bonusGranted;
    } catch {
      return false;
    }
  }
}
