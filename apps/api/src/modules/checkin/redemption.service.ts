import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CustomerEventType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BenefitsRepository } from '../benefits/benefits.repository';
import { VisitsRepository } from './visits.repository';
import { CustomerEventsRepository } from './customer-events.repository';
import { isCheckinV2 } from '../../common/experience/experience.util';

@Injectable()
export class RedemptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly benefits: BenefitsRepository,
    private readonly visits: VisitsRepository,
    private readonly events: CustomerEventsRepository,
  ) {}

  /**
   * Staff validates a redemption code. In one flow it: (1) atomically consumes
   * the code (no double redemption), (2) records/upgrades the visit to
   * confirmed_redemption, (3) links the visit and emits the timeline event.
   * The authoritative "used once" guarantee is the atomic consume in step 1.
   */
  async redeem(businessId: string, userId: string, rawCode: string) {
    const code = rawCode.trim().toUpperCase();
    if (!code) throw new NotFoundException('Código inválido');

    // V2-only: the redemption produces a Visit and a confirmed_redemption
    // attribution, neither of which may exist for a legacy business. Checked
    // before consuming so a legacy call never burns the code either. The legacy
    // benefits module (Benefit/BenefitParticipation) is untouched by this.
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { timezone: true, experienceVersion: true },
    });
    if (!business || !isCheckinV2(business)) throw new NotFoundException();

    const consumed = await this.benefits.consumeRedemption(
      businessId,
      code,
      userId,
    );
    if (consumed.status === 'not_found') {
      throw new NotFoundException('Código no encontrado');
    }
    if (consumed.status === 'already') {
      throw new ConflictException('Este beneficio ya fue canjeado');
    }

    const visit = await this.visits.registerRedemptionVisit({
      businessId,
      customerId: consumed.customerId,
      timezone: business?.timezone ?? 'America/Montevideo',
      benefitId: consumed.benefitId,
      participationId: consumed.participationId,
    });

    await this.benefits.attachRedeemedVisit(consumed.participationId, visit.id);
    await this.events.emit({
      businessId,
      customerId: consumed.customerId,
      type: CustomerEventType.benefit_redeemed,
      visitId: visit.id,
      metadata: { benefitId: consumed.benefitId },
    });

    return {
      ok: true as const,
      customerName: consumed.customerName,
      benefitTitle: consumed.benefitTitle,
      visitId: visit.id,
    };
  }
}
