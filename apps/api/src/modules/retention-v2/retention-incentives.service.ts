import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RetentionIncentiveDefinition } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRetentionIncentiveDto } from './dto/create-retention-incentive.dto';
import { UpdateRetentionIncentiveDto } from './dto/update-retention-incentive.dto';

/**
 * CRUD for the catalogue of incentives Flikker MAY offer automatically (Fase
 * C.5 §3). Every method is scoped to `businessId` — never trusts an id alone,
 * so one tenant can never read or touch another's catalogue.
 *
 * "Nothing may ever be offered that is not a row here" (see the model's own
 * comment in schema.prisma) is what this CRUD exists to keep true: the owner
 * is the only one who can create a row, and `automationEligible` is the
 * explicit, off-by-default consent that lets the engine use it unattended.
 */
@Injectable()
export class RetentionIncentivesService {
  constructor(private readonly prisma: PrismaService) {}

  list(businessId: string) {
    return this.prisma.retentionIncentiveDefinition.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOne(
    businessId: string,
    id: string,
  ): Promise<RetentionIncentiveDefinition> {
    const definition = await this.prisma.retentionIncentiveDefinition.findFirst(
      { where: { businessId, id } },
    );
    if (!definition) throw new NotFoundException('Incentive not found');
    return definition;
  }

  async create(businessId: string, dto: CreateRetentionIncentiveDto) {
    this.validateConfiguration(dto);
    return this.prisma.retentionIncentiveDefinition.create({
      data: {
        businessId,
        name: dto.name,
        type: dto.type,
        percentageValue: dto.percentageValue,
        fixedValue: dto.fixedValue,
        estimatedCost: dto.estimatedCost,
        description: dto.description,
        conditions: dto.conditions,
        expiresInDays: dto.expiresInDays ?? 7,
        // Both default to the schema's safe values: visible but never
        // automation-eligible until the owner explicitly opts in.
        active: dto.active ?? true,
        automationEligible: dto.automationEligible ?? false,
        rewardGoalEligible: dto.rewardGoalEligible ?? false,
        maxRedemptionsPerCustomer: dto.maxRedemptionsPerCustomer,
        maxTotalRedemptions: dto.maxTotalRedemptions,
        validDays: dto.validDays ?? [],
      },
    });
  }

  async update(
    businessId: string,
    id: string,
    dto: UpdateRetentionIncentiveDto,
  ) {
    const existing = await this.getOne(businessId, id);
    this.validateConfiguration({ ...existing, ...dto });

    return this.prisma.retentionIncentiveDefinition.update({
      where: { id: existing.id },
      data: dto,
    });
  }

  /**
   * Deactivates the incentive. A hard delete is only allowed when no
   * experiment variant has ever pointed to it — Fase C.5 §3: "no hacer
   * hard-delete si ya fue usado por experimentos". Deactivating is always
   * safe: `automationEligible`/`active` are re-checked at issue time, so an
   * incentive already in flight for a customer is untouched, but no NEW
   * issuance will ever pick it again.
   */
  async remove(businessId: string, id: string) {
    const existing = await this.getOne(businessId, id);

    const usedByVariant = await this.prisma.retentionVariant.findFirst({
      where: { businessId, incentiveDefinitionId: existing.id },
      select: { id: true },
    });

    if (usedByVariant) {
      await this.prisma.retentionIncentiveDefinition.update({
        where: { id: existing.id },
        data: { active: false },
      });
      throw new ConflictException(
        'This incentive was already used by an experiment and cannot be deleted; it has been deactivated instead.',
      );
    }

    await this.prisma.retentionIncentiveDefinition.delete({
      where: { id: existing.id },
    });
  }

  /**
   * Piloto V2 (ajuste #2) — REVERTIDO: hasta esta tanda, `automationEligible`
   * exigía conocer un `percentageValue`/`fixedValue`/`estimatedCost` antes de
   * autorizar. Eso confundía dos preguntas distintas: "¿qué le decimos al
   * cliente?" (siempre resuelto por `name`, obligatorio, ej. "Capuccino
   * gratis" — `message-templates.ts` solo usa `incentiveLabel`, nunca estos
   * campos numéricos) vs. "¿cuánto nos cuesta?" (una pregunta de economía,
   * no de autorización). Pedido explícito: el costo NUNCA debe ser requisito
   * para autorizar — si se desconoce, `estimateIncentiveCost`
   * (incentive-cost.ts) ya devuelve `null` y la UI ya muestra "costo no
   * configurado" en vez de fallar. Solo queda la regla de integridad de
   * datos: no combinar % y $ fijo a la vez.
   */
  private validateConfiguration(dto: {
    percentageValue?: number | null;
    fixedValue?: number | Prisma.Decimal | null;
  }) {
    if (dto.percentageValue != null && dto.fixedValue != null) {
      throw new BadRequestException(
        'An incentive cannot combine percentageValue and fixedValue',
      );
    }
  }
}
