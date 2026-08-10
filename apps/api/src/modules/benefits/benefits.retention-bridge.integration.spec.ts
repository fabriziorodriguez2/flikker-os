import { Test, TestingModule } from '@nestjs/testing';
import { BenefitType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BenefitsRepository } from './benefits.repository';
import { BenefitsService } from './benefits.service';
import { estimateIncentiveCost } from '../retention-v2/incentive-cost';
import {
  createTestBusiness,
  makeTestSuffix,
} from '../reviews/reviews.test-helpers';

/**
 * Pre-piloto #2 — "Beneficios múltiples + costo opcional". Contra DB real
 * (no mocks): reproduce exactamente el escenario del pedido — Capuccino
 * gratis (recuperación + recompensa), 10% descuento (recuperación), Upgrade
 * (recompensa) — los tres autorizados simultáneamente sin haber configurado
 * ningún costo, y confirma que desactivar el slot del QR (Benefit.active)
 * nunca desautoriza silenciosamente la automatización de otro beneficio.
 */
describe('BenefitsService — múltiples beneficios sin costo obligatorio (integration)', () => {
  let prisma: PrismaService;
  let service: BenefitsService;
  let businessId: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, BenefitsRepository, BenefitsService],
    }).compile();

    prisma = module.get(PrismaService);
    service = module.get(BenefitsService);
    await prisma.$connect();

    const suffix = makeTestSuffix();
    const business = await createTestBusiness(prisma, `bridge-multi-${suffix}`);
    businessId = business.id;
  });

  afterAll(async () => {
    await prisma.retentionIncentiveDefinition.deleteMany({
      where: { businessId },
    });
    await prisma.benefit.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('permite tres beneficios autorizados a la vez, sin costo, y economía queda "no disponible"', async () => {
    const capuccino = await service.create(businessId, {
      type: BenefitType.gift,
      title: 'Capuccino gratis',
      active: true, // el único que puede estar "activo" en el slot del QR
    });
    const descuento = await service.create(businessId, {
      type: BenefitType.discount,
      title: '10% descuento',
      active: false,
    });
    const upgrade = await service.create(businessId, {
      type: BenefitType.promotion,
      title: 'Upgrade',
      active: false,
    });

    // Capuccino gratis: [✓ Recuperar] [✓ Recompensa] — sin costo.
    await service.setRetentionBridge(businessId, capuccino.id, {
      recoveryEnabled: true,
    });
    await service.setRetentionBridge(businessId, capuccino.id, {
      rewardGoalEnabled: true,
    });

    // 10% descuento: [✓ Recuperar] — sin costo tampoco.
    await service.setRetentionBridge(businessId, descuento.id, {
      recoveryEnabled: true,
    });

    // Upgrade: [✓ Recompensa].
    await service.setRetentionBridge(businessId, upgrade.id, {
      rewardGoalEnabled: true,
    });

    const definitions = await prisma.retentionIncentiveDefinition.findMany({
      where: { businessId },
      orderBy: { name: 'asc' },
    });
    expect(definitions).toHaveLength(3);

    const byName = Object.fromEntries(definitions.map((d) => [d.name, d]));
    expect(byName['Capuccino gratis'].automationEligible).toBe(true);
    expect(byName['Capuccino gratis'].rewardGoalEligible).toBe(true);
    expect(byName['10% descuento'].automationEligible).toBe(true);
    expect(byName['10% descuento'].rewardGoalEligible).toBe(false);
    expect(byName['Upgrade'].automationEligible).toBe(false);
    expect(byName['Upgrade'].rewardGoalEligible).toBe(true);

    // Ninguno tiene costo configurado — la economía debe quedar "no
    // disponible", nunca fabricar un número ni bloquear la autorización.
    for (const def of definitions) {
      expect(
        estimateIncentiveCost(
          {
            estimatedCost: def.estimatedCost,
            percentageValue: def.percentageValue,
            fixedValue: def.fixedValue,
          },
          null,
        ),
      ).toBeNull();
    }

    // Solo "Capuccino gratis" está `active` (el slot del QR) — pero el
    // presupuesto por CANTIDAD sigue pudiendo contar los 3 autorizados,
    // independientemente de cuál está activo.
    const activeCount = definitions.filter(
      (d) => d.automationEligible || d.rewardGoalEligible,
    ).length;
    expect(activeCount).toBe(3);

    // Desactivar el Benefit que SÍ estaba activo (cambiar el slot del QR a
    // "10% descuento") nunca debe desautorizar silenciosamente el bridge de
    // Capuccino — este es exactamente el gap que el ajuste #2 corrige.
    await service.deactivate(businessId, capuccino.id);
    await service.activate(businessId, descuento.id);

    const afterSwap = await prisma.retentionIncentiveDefinition.findFirst({
      where: { businessId, name: 'Capuccino gratis' },
    });
    expect(afterSwap?.automationEligible).toBe(true);
    expect(afterSwap?.rewardGoalEligible).toBe(true);

    // Recién al ELIMINAR (no desactivar) el Benefit, su bridge queda
    // desautorizado — el borrado real sigue siendo la única acción que
    // desautoriza, per diseño explícito.
    await service.remove(businessId, capuccino.id);
    const afterDelete = await prisma.retentionIncentiveDefinition.findFirst({
      where: { businessId, name: 'Capuccino gratis' },
    });
    expect(afterDelete?.automationEligible).toBe(false);
    expect(afterDelete?.rewardGoalEligible).toBe(false);
    expect(afterDelete?.benefitId).toBeNull();
  });
});
