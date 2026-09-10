import { Test, TestingModule } from '@nestjs/testing';
import { BenefitIssuanceSource, BenefitType } from '@prisma/client';
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
 * Política CHECKIN_ACTIVE/WELCOME — "a lo sumo una participación ABIERTA por
 * (negocio, beneficio, cliente, origen)", reforzada con el índice único
 * parcial `benefit_participations_one_open_per_source` (ver migración
 * 20260910090000 y el comentario del modelo en schema.prisma).
 *
 * Contra DB real a propósito: lo que se prueba acá es la garantía de la BASE
 * cuando dos requests compiten, no solo la lógica de la app — un mock nunca
 * puede reproducir el P2002 real que dispara el backstop.
 */
describe('BenefitParticipation — a lo sumo una abierta por origen (integration)', () => {
  let prisma: PrismaService;
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
    repository = module.get(BenefitsRepository);
    await prisma.$connect();

    const suffix = makeTestSuffix();
    const business = await createTestBusiness(prisma, `one-open-${suffix}`);
    businessId = business.id;

    const customer = await prisma.customer.create({
      data: {
        businessId,
        name: 'Fabrizio',
        phoneE164: `+59891${suffix.slice(0, 6)}`,
      },
    });
    customerId = customer.id;

    const benefit = await prisma.benefit.create({
      data: {
        businessId,
        type: BenefitType.gift,
        title: 'Café gratis',
        active: true,
      },
    });
    benefitId = benefit.id;
  });

  afterAll(async () => {
    await prisma.benefitParticipation.deleteMany({ where: { businessId } });
    await prisma.benefit.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await prisma.benefitParticipation.deleteMany({ where: { businessId } });
  });

  const openRows = () =>
    prisma.benefitParticipation.findMany({
      where: {
        businessId,
        benefitId,
        customerId,
        source: BenefitIssuanceSource.CHECKIN_ACTIVE,
        redeemedAt: null,
      },
    });

  // 1. Visit válida → crea CHECKIN_ACTIVE.
  it('sin ninguna participación previa, ensureRedemptionCode crea una CHECKIN_ACTIVE abierta', async () => {
    const p = await repository.ensureRedemptionCode(
      businessId,
      benefitId,
      customerId,
      BenefitIssuanceSource.CHECKIN_ACTIVE,
    );
    expect(p.redemptionCode).toBeTruthy();
    expect(p.redeemedAt).toBeNull();
    await expect(openRows()).resolves.toHaveLength(1);
  });

  // 2. Segunda "visita" (llamada) sobre la misma abierta → la reutiliza.
  it('con una abierta vigente, una segunda llamada reutiliza — no crea otra fila', async () => {
    const p1 = await repository.ensureRedemptionCode(
      businessId,
      benefitId,
      customerId,
      BenefitIssuanceSource.CHECKIN_ACTIVE,
    );
    const p2 = await repository.ensureRedemptionCode(
      businessId,
      benefitId,
      customerId,
      BenefitIssuanceSource.CHECKIN_ACTIVE,
    );
    expect(p2.id).toBe(p1.id);
    expect(p2.redemptionCode).toBe(p1.redemptionCode);
    await expect(openRows()).resolves.toHaveLength(1);
  });

  // 3. Canje → queda sin abierta.
  it('canjear la participación la saca del conjunto de abiertas', async () => {
    const p = await repository.ensureRedemptionCode(
      businessId,
      benefitId,
      customerId,
      BenefitIssuanceSource.CHECKIN_ACTIVE,
    );
    const redeemed = await repository.consumeRedemption(
      p.redemptionCode!,
      'user-1',
    );
    expect(redeemed.status).toBe('ok');
    await expect(openRows()).resolves.toHaveLength(0);
  });

  // 4. Re-scan (no justVisited) después del canje → el service ya no llama
  //    a `ensureRedemptionCode` en ese caso (ver checkin.service.ts), pero
  //    esto fija la parte que sí vive en el repository: SI algo la llamara
  //    de nuevo tras un canje, no debe reventar ni duplicar por error —
  //    debe comportarse como el caso 5 (emite una nueva). El guard de "no
  //    emitir sin visita válida" es responsabilidad de CheckinService y
  //    está cubierto en checkin.service.spec.ts, no acá.

  // 5. Próxima visita válida (tras el canje) → crea una nueva.
  it('tras el canje, la próxima llamada emite una participación NUEVA', async () => {
    const p1 = await repository.ensureRedemptionCode(
      businessId,
      benefitId,
      customerId,
      BenefitIssuanceSource.CHECKIN_ACTIVE,
    );
    await repository.consumeRedemption(p1.redemptionCode!, 'user-1');

    const p2 = await repository.ensureRedemptionCode(
      businessId,
      benefitId,
      customerId,
      BenefitIssuanceSource.CHECKIN_ACTIVE,
    );
    expect(p2.id).not.toBe(p1.id);
    expect(p2.redeemedAt).toBeNull();

    const all = await prisma.benefitParticipation.findMany({
      where: { businessId, benefitId, customerId },
    });
    expect(all).toHaveLength(2);
    expect(all.filter((r) => r.redeemedAt === null)).toHaveLength(1);
  });

  // 6. Dos requests concurrentes → exactamente una abierta, y las dos
  //    llamadas terminan apuntando a la MISMA fila (se reutiliza, no se
  //    reporta un error al segundo request).
  it('dos ensureRedemptionCode concurrentes dejan exactamente UNA abierta', async () => {
    const [p1, p2] = await Promise.all([
      repository.ensureRedemptionCode(
        businessId,
        benefitId,
        customerId,
        BenefitIssuanceSource.CHECKIN_ACTIVE,
      ),
      repository.ensureRedemptionCode(
        businessId,
        benefitId,
        customerId,
        BenefitIssuanceSource.CHECKIN_ACTIVE,
      ),
    ]);

    const rows = await openRows();
    expect(rows).toHaveLength(1);
    // Las dos llamadas apuntan a la fila que ganó la carrera — ninguna
    // vuelve con un id huérfano de una fila que la DB rechazó.
    expect(p1.id).toBe(rows[0].id);
    expect(p2.id).toBe(rows[0].id);
  });

  // 7. PROMOTION del mismo Benefit puede coexistir con una CHECKIN_ACTIVE
  //    abierta — el índice único parcial deliberadamente no cubre PROMOTION.
  it('una PROMOTION abierta convive con una CHECKIN_ACTIVE abierta del mismo Benefit', async () => {
    const active = await repository.ensureRedemptionCode(
      businessId,
      benefitId,
      customerId,
      BenefitIssuanceSource.CHECKIN_ACTIVE,
    );
    const promo = await repository.issueBenefit({
      businessId,
      benefitId,
      customerId,
      source: BenefitIssuanceSource.PROMOTION,
    });

    expect(active.id).not.toBe(promo.id);
    const all = await prisma.benefitParticipation.findMany({
      where: { businessId, benefitId, customerId },
    });
    expect(all.filter((r) => r.redeemedAt === null)).toHaveLength(2);
  });

  // 7b. Dos PROMOTION del mismo Benefit, ambas abiertas — el contrato
  //     existente de Promociones ("cada envío es una emisión nueva e
  //     independiente, nunca idempotente") no puede quedar roto por este
  //     índice, porque simplemente no lo cubre.
  it('dos PROMOTION del mismo Benefit, ninguna canjeada, coexisten sin chocar', async () => {
    const p1 = await repository.issueBenefit({
      businessId,
      benefitId,
      customerId,
      source: BenefitIssuanceSource.PROMOTION,
    });
    const p2 = await repository.issueBenefit({
      businessId,
      benefitId,
      customerId,
      source: BenefitIssuanceSource.PROMOTION,
    });
    expect(p1.id).not.toBe(p2.id);
    const all = await prisma.benefitParticipation.findMany({
      where: {
        businessId,
        benefitId,
        customerId,
        source: BenefitIssuanceSource.PROMOTION,
      },
    });
    expect(all).toHaveLength(2);
  });

  // 8. Varias emisiones históricas canjeadas siguen permitidas — el índice
  //    solo restringe `redeemed_at IS NULL`.
  it('tres ciclos de emitir+canjear CHECKIN_ACTIVE dejan 3 filas, las 3 canjeadas', async () => {
    for (let i = 0; i < 3; i++) {
      const p = await repository.ensureRedemptionCode(
        businessId,
        benefitId,
        customerId,
        BenefitIssuanceSource.CHECKIN_ACTIVE,
      );
      await repository.consumeRedemption(p.redemptionCode!, 'user-1');
    }
    const all = await prisma.benefitParticipation.findMany({
      where: {
        businessId,
        benefitId,
        customerId,
        source: BenefitIssuanceSource.CHECKIN_ACTIVE,
      },
    });
    expect(all).toHaveLength(3);
    expect(all.every((r) => r.redeemedAt !== null)).toBe(true);
    await expect(openRows()).resolves.toHaveLength(0);
  });
});
