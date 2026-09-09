import { randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { BenefitType, BusinessStatus, ExperienceVersion } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CheckinModule } from './checkin.module';
import { CheckinService } from './checkin.service';
import { PublicService } from '../public/public.service';

/**
 * El bug grave que encontró la auditoría, de punta a punta contra DB real:
 * un QR histórico impreso ANTES de que el negocio pasara a Check-in V2 tiene
 * que seguir funcionando — redirigiendo al flujo V2 real — en vez de correr
 * el registro legacy o quedar roto.
 *
 * No es una suite Playwright: es el mismo camino que un navegador haría,
 * llamando a los services reales (`PublicService.getQrInfo` →
 * `CheckinService.register`) contra Postgres real, sin mocks. Cubre
 * exactamente la cadena que pidió la auditoría:
 *
 *   negocio CHECKIN_V2 → /qr/{businessId} histórico → redirect a
 *   /check-in/{token} → registra visita → 1 Customer, 1 Visit → RewardGoal
 *   recibe la visita → captureContact LEGACY nunca corre.
 */
describe('QR histórico de un negocio Check-in V2 (E2E conceptual, integration)', () => {
  let prisma: PrismaService;
  let checkin: CheckinService;
  let publicService: PublicService;
  let businessId: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
        // `PublicModule` ya es un import de `CheckinModule` — no hace falta
        // agregarlo aparte. `{ strict: false }` alcanza el `PublicService`
        // real sin que `PublicModule` tenga que exportarlo.
        CheckinModule,
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService, { strict: false });
    checkin = moduleRef.get(CheckinService, { strict: false });
    publicService = moduleRef.get(PublicService, { strict: false });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    const business = await prisma.business.create({
      data: {
        id: randomUUID(),
        name: 'Café QR Histórico',
        slug: `qr-legacy-e2e-${randomUUID().slice(0, 8)}`,
        status: BusinessStatus.ACTIVE,
        country: 'UY',
        currency: 'UYU',
        timezone: 'America/Montevideo',
        // Ya migró a V2 — pero el QR físico del mostrador todavía apunta al
        // link viejo `/qr/{businessId}`. Deliberadamente SIN VisitSource
        // creado de antemano: es exactamente el estado real de un negocio
        // que migró y nunca reimprimió su QR.
        experienceVersion: ExperienceVersion.CHECKIN_V2,
      },
    });
    businessId = business.id;

    // Lo mínimo para que la visita real mueva una CustomerRewardGoal —
    // mismo fixture que ya usan los tests de reward goals contra DB real.
    await prisma.retentionIncentiveDefinition.create({
      data: {
        businessId,
        name: 'Café gratis',
        type: BenefitType.gift,
        active: true,
        rewardGoalEligible: true,
      },
    });
    await prisma.retentionSettings.create({
      data: { businessId, rewardGoalsEnabled: true },
    });
  });

  afterEach(async () => {
    await prisma.customerRewardGoal.deleteMany({ where: { businessId } });
    await prisma.retentionDecisionLog
      .deleteMany({ where: { businessId } })
      .catch(() => undefined);
    await prisma.retentionIncentiveDefinition.deleteMany({
      where: { businessId },
    });
    await prisma.retentionSettings.deleteMany({ where: { businessId } });
    await prisma.message
      .deleteMany({ where: { businessId } })
      .catch(() => undefined);
    await prisma.customerEvent.deleteMany({ where: { businessId } });
    await prisma.visit.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.visitSource.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
  });

  it('el QR histórico redirige a /check-in/{token} en vez de correr el registro legacy', async () => {
    const info = await publicService.getQrInfo(businessId);

    expect(info).toEqual({
      redirectPath: expect.stringMatching(/^\/check-in\/[^/]+$/),
    });

    // Y el VisitSource default se creó de verdad — no un token inventado.
    const sources = await prisma.visitSource.findMany({
      where: { businessId },
    });
    expect(sources).toHaveLength(1);
    expect(sources[0].isDefault).toBe(true);
  });

  it('ensureDefaultSource es idempotente: dos QR históricos seguidos resuelven al MISMO token, sin duplicar la fuente', async () => {
    const first = await publicService.getQrInfo(businessId);
    const second = await publicService.getQrInfo(businessId);

    expect(first).toEqual(second);

    const sources = await prisma.visitSource.findMany({
      where: { businessId },
    });
    expect(sources).toHaveLength(1);
  });

  it('captureContact LEGACY nunca corre para este negocio — 404, cero Customer creado', async () => {
    await expect(
      publicService.captureContact(
        businessId,
        'Cliente Legacy',
        '+59891111111',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    const count = await prisma.customer.count({ where: { businessId } });
    expect(count).toBe(0);
  });

  it('cadena completa: redirect → register real → exactamente 1 Customer, 1 Visit, y RewardGoal recibe la visita', async () => {
    const info = (await publicService.getQrInfo(businessId)) as {
      redirectPath: string;
    };
    const token = info.redirectPath.replace('/check-in/', '');
    const phone = `+59891${String(Date.now()).slice(-6)}`;

    const result = await checkin.register(token, {
      name: 'Cliente Real',
      phone,
    });

    expect(result.status).toBe('registered');

    const customers = await prisma.customer.findMany({
      where: { businessId },
    });
    expect(customers).toHaveLength(1);

    const visits = await prisma.visit.findMany({ where: { businessId } });
    expect(visits).toHaveLength(1);
    expect(visits[0].customerId).toBe(customers[0].id);

    // RewardGoal recibió la visita: se creó (o avanzó) un ciclo ACTIVE real,
    // no una promesa vacía — mismo criterio que ya prueban los tests de
    // reward-goals contra DB real.
    const goal = await prisma.customerRewardGoal.findFirst({
      where: { businessId, customerId: customers[0].id },
    });
    expect(goal).not.toBeNull();
  });
});
