import { randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import {
  BenefitIssuanceSource,
  BenefitType,
  CustomerSegment,
  RewardGoalStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BenefitsRepository } from './benefits.repository';
import { BenefitsService } from './benefits.service';
import { ProgramAuditService } from '../program-audit/program-audit.service';
import { RetentionSettingsService } from '../retention-v2/retention-settings.service';
import { RetentionExperimentsAdminService } from '../retention-v2/retention-experiments-admin.service';
import { RetentionV2BootstrapService } from '../retention-v2/retention-v2-bootstrap.service';
import {
  createTestBusiness,
  makeTestSuffix,
} from '../reviews/reviews.test-helpers';
import { PlansService } from '../plans/plans.service';
import { PlansRepository } from '../plans/plans.repository';

/**
 * "No cambiar una promesa que ya tiene un cliente" — contra DB real.
 *
 * El bloqueo YA NO mira `rewardGoalEligible` (demasiado amplio: un beneficio
 * recién autorizado, sin ningún cliente juntando sellos todavía, no le
 * rompe nada a nadie si se edita). Mira si existe al menos un
 * `CustomerRewardGoal` VIVO (ACTIVE o UNLOCKED) que promete la definición de
 * ESTE beneficio ahora mismo.
 *
 * Y, en paralelo, confirma que el historial de un cliente con la promesa ya
 * cerrada (REDEEMED) sigue mostrando lo que de verdad recibió, incluso
 * después de que el catálogo actual cambió — vía `benefitTitleSnapshot`.
 */
describe('BenefitsService — bloqueo de edición por promesa viva (integration)', () => {
  let prisma: PrismaService;
  let service: BenefitsService;
  let businessId: string;
  let otherBusinessId: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        BenefitsRepository,
        BenefitsService,
        ProgramAuditService,
        RetentionSettingsService,
        RetentionExperimentsAdminService,
        RetentionV2BootstrapService,
        PlansService,
        PlansRepository,
      ],
    }).compile();

    prisma = module.get(PrismaService);
    service = module.get(BenefitsService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    const suffix = makeTestSuffix();
    businessId = (await createTestBusiness(prisma, `rename-${suffix}`)).id;
    otherBusinessId = (
      await createTestBusiness(prisma, `rename-other-${suffix}`)
    ).id;
  });

  afterEach(async () => {
    for (const id of [businessId, otherBusinessId]) {
      await prisma.customerRewardGoal.deleteMany({ where: { businessId: id } });
      await prisma.benefitParticipation.deleteMany({
        where: { businessId: id },
      });
      await prisma.customer.deleteMany({ where: { businessId: id } });
      await prisma.retentionIncentiveDefinition.deleteMany({
        where: { businessId: id },
      });
      await prisma.benefit.deleteMany({ where: { businessId: id } });
      await prisma.business.delete({ where: { id } }).catch(() => undefined);
    }
  });

  async function makeCustomer(targetBusinessId: string) {
    return prisma.customer.create({
      data: {
        id: randomUUID(),
        businessId: targetBusinessId,
        name: 'Cliente Test',
        phoneE164: `+5989${String(Math.random()).slice(2, 9)}`,
      },
    });
  }

  /** Beneficio autorizado como recompensa de tarjeta, listo para bridgear goals. */
  async function makeReward(targetBusinessId: string, title: string) {
    const benefit = await service.create(targetBusinessId, {
      type: BenefitType.gift,
      title,
    });
    await service.setRetentionBridge(targetBusinessId, benefit.id, {
      rewardGoalEnabled: true,
    });
    const definition =
      await prisma.retentionIncentiveDefinition.findUniqueOrThrow({
        where: { benefitId: benefit.id },
      });
    return { benefit, definition };
  }

  async function makeGoal(
    targetBusinessId: string,
    customerId: string,
    definitionId: string,
    status: RewardGoalStatus,
  ) {
    return prisma.customerRewardGoal.create({
      data: {
        id: randomUUID(),
        businessId: targetBusinessId,
        customerId,
        incentiveDefinitionId: definitionId,
        status,
        startingVisitCount: 0,
        targetAdditionalVisits: 5,
        activatedAt: new Date(),
        unlockedAt: status !== RewardGoalStatus.ACTIVE ? new Date() : null,
        redeemedAt: status === RewardGoalStatus.REDEEMED ? new Date() : null,
        reasonCode: 'TEST',
        segmentAtCreation: CustomerSegment.NEW,
      },
    });
  }

  it('rewardGoalEligible + 0 goals vivos → edición permitida', async () => {
    const { benefit } = await makeReward(businessId, 'Café gratis');

    const updated = await service.update(businessId, benefit.id, {
      title: '2x1',
    });

    expect(updated.title).toBe('2x1');
  });

  it('ACTIVE → bloqueada', async () => {
    const { benefit, definition } = await makeReward(businessId, 'Café gratis');
    const customer = await makeCustomer(businessId);
    await makeGoal(
      businessId,
      customer.id,
      definition.id,
      RewardGoalStatus.ACTIVE,
    );

    await expect(
      service.update(businessId, benefit.id, { title: '2x1' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const stillOriginal = await prisma.benefit.findUniqueOrThrow({
      where: { id: benefit.id },
    });
    expect(stillOriginal.title).toBe('Café gratis');
  });

  it('UNLOCKED → bloqueada', async () => {
    const { benefit, definition } = await makeReward(businessId, 'Café gratis');
    const customer = await makeCustomer(businessId);
    await makeGoal(
      businessId,
      customer.id,
      definition.id,
      RewardGoalStatus.UNLOCKED,
    );

    await expect(
      service.update(businessId, benefit.id, { type: BenefitType.discount }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('solo REDEEMED → NO bloquea el catálogo actual, pero el historial conserva la promesa original', async () => {
    const { benefit, definition } = await makeReward(businessId, 'Café gratis');
    const customer = await makeCustomer(businessId);

    // El cliente ya completó y canjeó su tarjeta — la promesa está cerrada.
    await makeGoal(
      businessId,
      customer.id,
      definition.id,
      RewardGoalStatus.REDEEMED,
    );

    // El beneficio también fue otorgado directamente (fuera de la tarjeta) —
    // exactamente el caso que `benefitTitleSnapshot` protege. `issueBenefit`,
    // no `registerParticipation` (que ya quedó acotado a sorteos): esto es
    // un gift, no un raffle.
    await service.issueBenefit({
      businessId,
      benefitId: benefit.id,
      customerId: customer.id,
      source: BenefitIssuanceSource.PROMOTION,
    });

    // El catálogo puede seguir evolucionando: nadie está esperando esto ya.
    const updated = await service.update(businessId, benefit.id, {
      title: '2x1',
    });
    expect(updated.title).toBe('2x1');

    // Pero lo que ese cliente REALMENTE recibió sigue diciendo "Café gratis",
    // no "2x1" — la definición vieja nunca sigue un rename posterior...
    const staleDefinition =
      await prisma.retentionIncentiveDefinition.findUnique({
        where: { id: definition.id },
      });
    expect(staleDefinition?.name).toBe('Café gratis');

    // ...y la participación directa quedó con su propio snapshot, no una
    // referencia viva al `Benefit.title` actual.
    const participation = await prisma.benefitParticipation.findFirstOrThrow({
      where: { businessId, benefitId: benefit.id, customerId: customer.id },
    });
    expect(participation.benefitTitleSnapshot).toBe('Café gratis');
  });

  it('cross-business: goals vivos en OTRO negocio nunca bloquean acá', async () => {
    // Mismo título en los dos negocios, a propósito: si el bloqueo alguna vez
    // filtrara por nombre en vez de por `businessId`, este test lo atraparía.
    const { definition: otherDefinition } = await makeReward(
      otherBusinessId,
      'Café gratis',
    );
    const otherCustomer = await makeCustomer(otherBusinessId);
    await makeGoal(
      otherBusinessId,
      otherCustomer.id,
      otherDefinition.id,
      RewardGoalStatus.ACTIVE,
    );

    // Este negocio tiene el MISMO título, pero es un Benefit/definición
    // completamente distintos, sin ningún goal propio.
    const { benefit } = await makeReward(businessId, 'Café gratis');

    const updated = await service.update(businessId, benefit.id, {
      title: '2x1',
    });
    expect(updated.title).toBe('2x1');
  });
});
