import { Test, TestingModule } from '@nestjs/testing';
import {
  BenefitIssuanceSource,
  BenefitType,
  CustomerSegment,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BenefitsRepository } from './benefits.repository';
import { BenefitsService } from './benefits.service';
import { ProgramAuditService } from '../program-audit/program-audit.service';
import { RetentionSettingsService } from '../retention-v2/retention-settings.service';
import { RetentionExperimentsAdminService } from '../retention-v2/retention-experiments-admin.service';
import { RetentionV2BootstrapService } from '../retention-v2/retention-v2-bootstrap.service';
import { PlansService } from '../plans/plans.service';
import { PlansRepository } from '../plans/plans.repository';
import {
  createTestBusiness,
  makeTestSuffix,
} from '../reviews/reviews.test-helpers';

/**
 * Pedido explícito: un cliente puede recibir el MISMO Benefit múltiples
 * veces, cada entrega es su propia emisión auditable para siempre — sin
 * `@@unique([benefitId, customerId])` de por medio. Contra DB real: es el
 * único nivel que prueba de verdad que las filas conviven sin pisarse.
 */
describe('BenefitParticipation — múltiples emisiones del mismo Benefit (integration)', () => {
  let prisma: PrismaService;
  let service: BenefitsService;
  let repository: BenefitsRepository;
  let businessId: string;
  let customerId: string;
  let benefitId: string;

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
    repository = module.get(BenefitsRepository);
    await prisma.$connect();

    const suffix = makeTestSuffix();
    const business = await createTestBusiness(prisma, `issuance-${suffix}`);
    businessId = business.id;

    const customer = await prisma.customer.create({
      data: {
        businessId,
        name: 'Juan',
        phoneE164: `+59890${suffix.slice(0, 6)}`,
      },
    });
    customerId = customer.id;

    const benefit = await prisma.benefit.create({
      data: {
        businessId,
        type: BenefitType.discount,
        title: '2x1',
        active: false,
      },
    });
    benefitId = benefit.id;
  });

  afterAll(async () => {
    await prisma.customerRewardGoal.deleteMany({ where: { businessId } });
    await prisma.benefitParticipation.deleteMany({ where: { businessId } });
    await prisma.benefit.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await prisma.customerRewardGoal.deleteMany({ where: { businessId } });
    await prisma.benefitParticipation.deleteMany({ where: { businessId } });
  });

  it('recibido y canjeado 3 veces → 3 emisiones distintas, cada una con su propio código', async () => {
    const p1 = await service.issueBenefit({
      businessId,
      benefitId,
      customerId,
      source: BenefitIssuanceSource.PROMOTION,
    });
    const p2 = await service.issueBenefit({
      businessId,
      benefitId,
      customerId,
      source: BenefitIssuanceSource.PROMOTION,
    });
    const p3 = await service.issueBenefit({
      businessId,
      benefitId,
      customerId,
      source: BenefitIssuanceSource.PROMOTION,
    });

    // Tres filas, tres ids, tres códigos — nada compartido.
    const ids = [p1.id, p2.id, p3.id];
    const codes = [p1.redemptionCode, p2.redemptionCode, p3.redemptionCode];
    expect(new Set(ids).size).toBe(3);
    expect(new Set(codes).size).toBe(3);
    expect(codes.every((c) => typeof c === 'string' && c.length > 0)).toBe(
      true,
    );

    const rows = await prisma.benefitParticipation.findMany({
      where: { businessId, benefitId, customerId },
    });
    expect(rows).toHaveLength(3);

    // Canjear la primera.
    const redeemed = await repository.consumeRedemption(
      p1.redemptionCode!,
      'user-1',
    );
    expect(redeemed).toMatchObject({ status: 'ok', participationId: p1.id });

    // Emisión #1 queda REDIMIDA para siempre; #2 y #3 siguen abiertas,
    // intactas.
    const after = await prisma.benefitParticipation.findMany({
      where: { businessId, benefitId, customerId },
      orderBy: { createdAt: 'asc' },
    });
    expect(after.find((r) => r.id === p1.id)?.redeemedAt).not.toBeNull();
    expect(after.find((r) => r.id === p2.id)?.redeemedAt).toBeNull();
    expect(after.find((r) => r.id === p3.id)?.redeemedAt).toBeNull();
    expect(after.find((r) => r.id === p2.id)?.redemptionCode).toBe(
      p2.redemptionCode,
    );
  });

  it('canjear una no canjea la otra — cada canje es atómico e independiente', async () => {
    const p1 = await service.issueBenefit({
      businessId,
      benefitId,
      customerId,
      source: BenefitIssuanceSource.PROMOTION,
    });
    const p2 = await service.issueBenefit({
      businessId,
      benefitId,
      customerId,
      source: BenefitIssuanceSource.PROMOTION,
    });

    await repository.consumeRedemption(p1.redemptionCode!, 'user-1');
    const secondRedeem = await repository.consumeRedemption(
      p2.redemptionCode!,
      'user-1',
    );

    // El canje de la primera nunca bloqueó ni afectó el de la segunda.
    expect(secondRedeem).toMatchObject({ status: 'ok', participationId: p2.id });
  });

  it('un QR ya canjeado nunca vuelve a ser válido', async () => {
    const p1 = await service.issueBenefit({
      businessId,
      benefitId,
      customerId,
      source: BenefitIssuanceSource.PROMOTION,
    });

    const first = await repository.consumeRedemption(
      p1.redemptionCode!,
      'user-1',
    );
    expect(first.status).toBe('ok');

    const second = await repository.consumeRedemption(
      p1.redemptionCode!,
      'user-2',
    );
    expect(second).toMatchObject({ status: 'already' });
  });

  it('dos emisiones abiertas del mismo Benefit se muestran correctamente en getOtherAvailableBenefits', async () => {
    const p1 = await service.issueBenefit({
      businessId,
      benefitId,
      customerId,
      source: BenefitIssuanceSource.PROMOTION,
    });
    const p2 = await service.issueBenefit({
      businessId,
      benefitId,
      customerId,
      source: BenefitIssuanceSource.PROMOTION,
    });

    const available = await service.getOtherAvailableBenefits(
      businessId,
      customerId,
      [],
    );

    expect(available).toHaveLength(2);
    expect(new Set(available.map((b) => b.id))).toEqual(
      new Set([p1.id, p2.id]),
    );

    // Canjear una la saca de la lista, la otra sigue apareciendo.
    await repository.consumeRedemption(p1.redemptionCode!, 'user-1');
    const afterOneRedeemed = await service.getOtherAvailableBenefits(
      businessId,
      customerId,
      [],
    );
    expect(afterOneRedeemed).toHaveLength(1);
    expect(afterOneRedeemed[0].id).toBe(p2.id);
  });

  it('bienvenida + promoción del mismo Benefit coexisten sin pisarse', async () => {
    const welcome = await repository.ensureRedemptionCode(
      businessId,
      benefitId,
      customerId,
      BenefitIssuanceSource.WELCOME,
    );
    const promo = await service.issueBenefit({
      businessId,
      benefitId,
      customerId,
      source: BenefitIssuanceSource.PROMOTION,
    });

    expect(welcome.id).not.toBe(promo.id);
    expect(welcome.redemptionCode).not.toBe(promo.redemptionCode);

    const rows = await prisma.benefitParticipation.findMany({
      where: { businessId, benefitId, customerId },
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.source).sort()).toEqual(
      [BenefitIssuanceSource.PROMOTION, BenefitIssuanceSource.WELCOME].sort(),
    );

    // Canjear la de bienvenida no toca la de la promoción, y viceversa.
    await repository.consumeRedemption(welcome.redemptionCode!, 'user-1');
    const promoRow = await prisma.benefitParticipation.findUnique({
      where: { id: promo.id },
    });
    expect(promoRow?.redeemedAt).toBeNull();
    expect(promoRow?.redemptionCode).toBe(promo.redemptionCode);
  });

  /**
   * Peor caso deliberado: la promoción usa el MISMO benefitId que ya tiene
   * una participación ligada a una recompensa de tarjeta (`rewardGoal`) —
   * `issueBenefit` nunca busca ni muta una fila existente, así que ni
   * siquiera en este caso extremo puede pisarla.
   */
  it('una promoción nunca modifica una participación existente de recompensa de tarjeta', async () => {
    const definition = await prisma.retentionIncentiveDefinition.create({
      data: {
        businessId,
        benefitId,
        name: '2x1',
        type: BenefitType.discount,
        active: true,
        rewardGoalEligible: true,
      },
    });
    const rewardParticipation = await prisma.benefitParticipation.create({
      data: {
        businessId,
        benefitId,
        customerId,
        source: BenefitIssuanceSource.REWARD_GOAL,
        redemptionCode: 'REWARD01',
      },
    });
    await prisma.customerRewardGoal.create({
      data: {
        businessId,
        customerId,
        incentiveDefinitionId: definition.id,
        startingVisitCount: 0,
        targetAdditionalVisits: 5,
        reasonCode: 'TEST',
        segmentAtCreation: CustomerSegment.NEW,
        benefitParticipationId: rewardParticipation.id,
      },
    });

    const promo = await service.issueBenefit({
      businessId,
      benefitId,
      customerId,
      source: BenefitIssuanceSource.PROMOTION,
    });

    expect(promo.id).not.toBe(rewardParticipation.id);

    const rows = await prisma.benefitParticipation.findMany({
      where: { businessId, benefitId, customerId },
    });
    expect(rows).toHaveLength(2);

    const rewardRowAfter = await prisma.benefitParticipation.findUnique({
      where: { id: rewardParticipation.id },
    });
    expect(rewardRowAfter?.redemptionCode).toBe('REWARD01');
    expect(rewardRowAfter?.redeemedAt).toBeNull();
    expect(rewardRowAfter?.source).toBe(BenefitIssuanceSource.REWARD_GOAL);
  });
});
