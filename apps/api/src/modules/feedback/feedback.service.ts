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

type FeedbackMessage = NonNullable<
  Awaited<ReturnType<FeedbackRepository['findMessageByToken']>>
>;

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
    const googleReviewUrl =
      message.business.defaultReviewRedirectUrl ??
      message.business.googleBusinessProfileUrl;

    let alreadySubmitted: boolean;
    if (isCheckinV2) {
      // Única fuente de verdad para V2: `CheckinFeedback` — la MISMA tabla
      // que llena `CheckinFeedbackCard` dentro del check-in. Nunca
      // `FeedbackResponse` (esa es la tabla LEGACY): si ya contestó adentro
      // del check-in y después abre este recordatorio, tiene que ver
      // "ya respondiste", no un formulario nuevo.
      const visitId = await this.resolveVisitId(message);
      alreadySubmitted = visitId
        ? await this.feedbackRepository.hasFeedbackForVisit(visitId)
        : false;
    } else {
      alreadySubmitted = message.feedbackResponses.length > 0;
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

    const isCheckinV2 =
      message.business.experienceVersion === ExperienceVersion.CHECKIN_V2;

    if (isCheckinV2) return this.submitCheckinV2(message, dto);

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
      void this.ownerNotificationsQueue
        .enqueueLowFeedback({
          source: 'legacy',
          businessId: message.businessId,
          feedbackResponseId: feedback.id,
        })
        .catch(() => undefined);
    }

    return {
      ok: true,
      redirectedToGoogle: feedback.redirectedToGoogle,
      bonusGranted: false,
      offerGoogle: undefined,
    };
  }

  /**
   * V2 delega ENTERO a `RewardGoalFeedbackService` — el mismo servicio (y la
   * misma idempotencia por `visitId`) que usa `CheckinFeedbackCard` dentro
   * del check-in. `/r/{token}` deja de llevar su propia copia del feedback:
   * si el cliente ya contestó adentro del check-in, esto devuelve
   * `alreadySubmitted` sin crear nada nuevo, nunca un segundo registro
   * desconectado.
   */
  private async submitCheckinV2(
    message: FeedbackMessage,
    dto: SubmitFeedbackDto,
  ) {
    const visitId = await this.resolveVisitId(message);
    if (!visitId) {
      // Sin ninguna visita a la que atar el feedback (mensaje viejo, de
      // antes de `originatingVisitId`, y el cliente tampoco volvió después)
      // no hay dónde guardarlo en el read-model V2.
      throw new NotFoundException();
    }

    const result = await this.rewardGoalFeedback.submit(
      message.businessId,
      message.customerId,
      visitId,
      dto.score,
      dto.comment?.trim() || undefined,
    );

    // `result.offerGoogle` del servicio de reward goals es SIEMPRE `true`
    // (Google se ofrece con cualquier puntaje, esa parte no depende del
    // negocio) — pero acá, igual que antes de este cambio, se lo apaga si el
    // negocio ni siquiera tiene Google conectado. Mismo criterio que
    // `getByToken`, para que la pantalla nunca ofrezca un link roto.
    const googleReviewUrl =
      message.business.defaultReviewRedirectUrl ??
      message.business.googleBusinessProfileUrl;
    const offerGoogle = result.offerGoogle && Boolean(googleReviewUrl);

    // El aviso de "feedback bajo" al dueño ya no se dispara desde acá: lo
    // hace `RewardGoalFeedbackService.submit` (arriba), en el mismo momento
    // en que crea la fila de `CheckinFeedback` — el único punto por el que
    // pasan TANTO este link (`/r/{token}`) COMO la card dentro del check-in
    // (`CheckinService.submitFeedback`), así que un único disparo cubre los
    // dos caminos sin depender de que cada caller se acuerde de hacerlo. Acá
    // ya no se crea ninguna `FeedbackResponse`: para Check-in V2,
    // `CheckinFeedback` es la única fuente de verdad de principio a fin.
    return {
      ok: true,
      redirectedToGoogle: false,
      bonusGranted: result.bonusGranted,
      offerGoogle,
    };
  }

  /**
   * La visita a la que atar el feedback V2: la que ORIGINÓ este mensaje
   * (`originatingVisitId`) y, si el mensaje es de antes de que esa columna
   * existiera, la última visita real del cliente — mismo fallback que ya
   * usaba `grantStampForFeedback` antes de este cambio.
   */
  private async resolveVisitId(
    message: FeedbackMessage,
  ): Promise<string | null> {
    if (message.originatingVisitId) return message.originatingVisitId;
    const lastVisit = await this.feedbackRepository.findLastVisit(
      message.businessId,
      message.customerId,
    );
    return lastVisit?.id ?? null;
  }
}
