import { randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BenefitType,
  BusinessStatus,
  CustomerSegment,
  ExperienceVersion,
  RetentionExperimentStatus,
  RetentionObjective,
  RetentionStrategyType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RetentionResultsOverviewService } from '../retention-v2/retention-results-overview.service';
import { RetentionSettingsService } from '../retention-v2/retention-settings.service';
import { RetentionExperimentService } from '../retention-v2/retention-experiment.service';
import { RetentionExperimentsAdminService } from '../retention-v2/retention-experiments-admin.service';
import { RetentionV2BootstrapService } from '../retention-v2/retention-v2-bootstrap.service';
import { RetentionBudgetService } from '../retention-v2/retention-budget.service';
import { ProgramAuditService } from '../program-audit/program-audit.service';
import { WhatsAppBspService } from '../../jobs/whatsapp-bsp.service';
import { NotificationsService } from './notifications.service';

/**
 * Notificaciones contra DB real.
 *
 * Lo que importa acá es que la fachada no mienta ni filtre: que cada toggle
 * escriba SU campo, que un beneficio no autorizado no pueda colarse, y que
 * el vocabulario de Retention V2 no llegue nunca al panel.
 */
describe('Notificaciones — fachada sobre Retention V2 (integration)', () => {
  let prisma: PrismaService;
  let service: NotificationsService;
  let bootstrap: RetentionV2BootstrapService;

  const businesses: string[] = [];
  const ORIGINAL_WHAPI_TOKEN = process.env.WHAPI_TOKEN;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        NotificationsService,
        RetentionSettingsService,
        RetentionExperimentService,
        RetentionExperimentsAdminService,
        RetentionV2BootstrapService,
        RetentionBudgetService,
        ProgramAuditService,
        WhatsAppBspService,
        {
          // Los resultados vienen del motor; acá solo se prueba la traducción.
          provide: RetentionResultsOverviewService,
          useValue: { forBusiness: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(NotificationsService);
    bootstrap = moduleRef.get(RetentionV2BootstrapService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    process.env.WHAPI_TOKEN = ORIGINAL_WHAPI_TOKEN;
  });

  // El canal está "conectado" en todo este archivo salvo en el describe
  // dedicado a `## Canal` más abajo — todos los tests de arriba prueban los
  // interruptores de automatización en sí, no el canal, y deben poder seguir
  // leyendo "Activo" cuando corresponde.
  beforeEach(() => {
    process.env.WHAPI_TOKEN = 'test-token';
  });

  afterEach(async () => {
    for (const id of businesses.splice(0)) {
      await prisma.retentionIncentiveDefinition.deleteMany({
        where: { businessId: id },
      });
      await prisma.benefit.deleteMany({ where: { businessId: id } });
      await prisma.retentionSettings.deleteMany({ where: { businessId: id } });
      await prisma.business.delete({ where: { id } }).catch(() => undefined);
    }
  });

  async function makeBusiness() {
    const business = await prisma.business.create({
      data: {
        id: randomUUID(),
        name: 'Café Notificaciones',
        slug: `notif-${randomUUID().slice(0, 8)}`,
        status: BusinessStatus.ACTIVE,
        country: 'UY',
        currency: 'UYU',
        timezone: 'America/Montevideo',
        experienceVersion: ExperienceVersion.CHECKIN_V2,
      },
    });
    businesses.push(business.id);
    await prisma.retentionSettings.create({
      data: { businessId: business.id },
    });
    return business.id;
  }

  async function makeIncentive(businessId: string, name: string) {
    const benefit = await prisma.benefit.create({
      // `active: false` a propósito: hay un índice único parcial
      // (`benefits_one_active_per_business`) que permite UN solo beneficio
      // activo por negocio — "activo" ahí significa "el que se ofrece en el
      // check-in", que es otro concepto. La autorización para reactivación
      // vive en `automationEligible`, no acá.
      data: { businessId, title: name, type: BenefitType.gift, active: false },
    });
    return prisma.retentionIncentiveDefinition.create({
      data: {
        businessId,
        benefitId: benefit.id,
        name,
        type: BenefitType.gift,
        active: true,
      },
    });
  }

  const settingsOf = (businessId: string) =>
    prisma.retentionSettings.findUniqueOrThrow({ where: { businessId } });

  /** One issued BenefitParticipation this month, counting toward the cap. */
  async function issueOneBenefit(businessId: string, incentiveId: string) {
    const experiment = await prisma.retentionExperiment.create({
      data: {
        businessId,
        name: 'Test',
        objective: RetentionObjective.AT_RISK_RECOVERY,
        status: RetentionExperimentStatus.RUNNING,
      },
    });
    const variant = await prisma.retentionVariant.create({
      data: {
        experimentId: experiment.id,
        businessId,
        name: 'Beneficio',
        strategyType: RetentionStrategyType.SOFT_BENEFIT,
        incentiveDefinitionId: incentiveId,
        allocationPercent: 85,
      },
    });
    const customer = await prisma.customer.create({
      data: {
        businessId,
        name: 'Cliente',
        phoneE164: `+5989${String(Date.now() + Math.random())
          .replace('.', '')
          .slice(-7)}`,
      },
    });
    const benefit = await prisma.retentionIncentiveDefinition.findUniqueOrThrow(
      { where: { id: incentiveId }, select: { benefitId: true } },
    );
    const participation = await prisma.benefitParticipation.create({
      data: {
        benefitId: benefit.benefitId!,
        businessId,
        customerId: customer.id,
        redemptionCode: `TEST${Math.random().toString(36).slice(2, 8)}`,
      },
    });
    await prisma.retentionAssignment.create({
      data: {
        experimentId: experiment.id,
        variantId: variant.id,
        businessId,
        customerId: customer.id,
        segmentAtAssignment: CustomerSegment.AT_RISK,
        visitCountAtAssignment: 1,
        daysSinceLastVisit: 20,
        benefitParticipationId: participation.id,
      },
    });
  }

  // ── Independencia de los toggles ────────────────────────────────────────

  describe('los dos interruptores son independientes', () => {
    it('progreso ON / reactivación OFF', async () => {
      const businessId = await makeBusiness();

      await service.updateAutomations(businessId, {
        cercaDelPremio: true,
        teExtranamos: false,
      });

      const s = await settingsOf(businessId);
      expect(s.progressReminderEnabled).toBe(true);
      expect(s.automaticCampaignsEnabled).toBe(false);
    });

    it('progreso OFF / reactivación ON', async () => {
      const businessId = await makeBusiness();

      await service.updateAutomations(businessId, {
        cercaDelPremio: false,
        teExtranamos: true,
      });

      const s = await settingsOf(businessId);
      expect(s.progressReminderEnabled).toBe(false);
      expect(s.automaticCampaignsEnabled).toBe(true);
    });

    it('los dos ON prenden el motor', async () => {
      const businessId = await makeBusiness();
      // Sellos ON: sin esto "cerca del premio" no aparece en `automations`
      // (ver ## Sellos) y activeCount nunca podría llegar a 2.
      await prisma.retentionSettings.update({
        where: { businessId },
        data: { rewardGoalsEnabled: true },
      });

      const result = await service.updateAutomations(businessId, {
        cercaDelPremio: true,
        teExtranamos: true,
      });

      expect(result.status.activeCount).toBe(2);
      const business = await prisma.business.findUniqueOrThrow({
        where: { id: businessId },
      });
      expect(business.retentionEngineV2Enabled).toBe(true);
    });

    it('los dos OFF apagan el motor', async () => {
      const businessId = await makeBusiness();
      await service.updateAutomations(businessId, {
        cercaDelPremio: true,
        teExtranamos: true,
      });

      const result = await service.updateAutomations(businessId, {
        cercaDelPremio: false,
        teExtranamos: false,
      });

      expect(result.status.activeCount).toBe(0);
      const business = await prisma.business.findUniqueOrThrow({
        where: { id: businessId },
      });
      expect(business.retentionEngineV2Enabled).toBe(false);
    });

    /**
     * El caso que más importa: tocar un interruptor no puede mover el otro.
     * Es exactamente el bug que tenía la versión anterior, cuando ambos
     * colgaban de `automaticCampaignsEnabled`.
     */
    it('mandar SOLO un toggle deja el otro exactamente como estaba', async () => {
      const businessId = await makeBusiness();
      await service.updateAutomations(businessId, {
        cercaDelPremio: true,
        teExtranamos: true,
      });

      await service.updateAutomations(businessId, { teExtranamos: false });

      const s = await settingsOf(businessId);
      expect(s.progressReminderEnabled).toBe(true); // intacto
      expect(s.automaticCampaignsEnabled).toBe(false);
    });
  });

  /**
   * El bug real que motivó `resolveEffectiveAutomationState`.
   *
   * `RetentionSettings.automaticCampaignsEnabled` tiene default `true` en el
   * schema; `Business.retentionEngineV2Enabled` tiene default `false`. Un
   * negocio que nunca pasó por `updateAutomations` (o cuyo kill switch fue
   * tocado por separado desde Platform Admin) puede quedar con el primero en
   * true y el segundo en false — el worker no manda nada en ese estado
   * (`findOwnedBusinesses` filtra por el kill switch antes de mirar cualquier
   * otro flag), pero mostrar el flag crudo diría "Activo".
   *
   * Estos tests escriben la fila directamente, sin pasar por
   * `updateAutomations`, para reproducir el estado de drift tal cual puede
   * ocurrir en producción — no el que el propio servicio mantiene consistente.
   */
  describe('estado efectivo — el flag crudo puede mentir, el efectivo no', () => {
    it('auto=true / engine=false → Te extrañamos se muestra DESACTIVADO', async () => {
      const businessId = await makeBusiness(); // automaticCampaignsEnabled: true (default)
      // El kill switch queda en su default (false): nunca se llamó a updateAutomations.

      const overview = await service.overview(businessId);

      const teExtranamos = overview.automations.find(
        (a) => a.key === 'te_extranamos',
      );
      expect(teExtranamos?.enabled).toBe(false);
      expect(overview.status.activeCount).toBe(0);
    });

    it('auto=false / engine=true → sigue DESACTIVADO', async () => {
      const businessId = await makeBusiness();
      await prisma.retentionSettings.update({
        where: { businessId },
        data: { automaticCampaignsEnabled: false },
      });
      await prisma.business.update({
        where: { id: businessId },
        data: { retentionEngineV2Enabled: true },
      });

      const overview = await service.overview(businessId);

      expect(
        overview.automations.find((a) => a.key === 'te_extranamos')?.enabled,
      ).toBe(false);
    });

    it('auto=true / engine=true → recién ahí se muestra ACTIVO (una vez que además hay setup)', async () => {
      const businessId = await makeBusiness();
      await prisma.business.update({
        where: { id: businessId },
        data: { retentionEngineV2Enabled: true },
      });
      // automaticCampaignsEnabled ya es true por default.
      // Flags correctos por sí solos ya NO alcanzan para "Activo" — ver
      // `## Preparando` más abajo. Acá se agrega el setup para aislar
      // exactamente lo que este test original probaba (el drift de flags).
      await bootstrap.ensureDefaultRetentionSetup(businessId);

      const overview = await service.overview(businessId);

      expect(
        overview.automations.find((a) => a.key === 'te_extranamos')?.enabled,
      ).toBe(true);
      expect(overview.status.activeCount).toBe(1);
    });

    it('progressReminderEnabled sigue siendo independiente frente al mismo drift', async () => {
      const businessId = await makeBusiness();
      await prisma.retentionSettings.update({
        where: { businessId },
        data: {
          progressReminderEnabled: true,
          // Sellos ON: sin esto "cerca del premio" ni siquiera aparece en
          // `automations` (ver el describe de `## Sellos` más abajo) — este
          // test es sobre la independencia del flag, no sobre el gate.
          rewardGoalsEnabled: true,
        },
      });
      await prisma.business.update({
        where: { id: businessId },
        data: { retentionEngineV2Enabled: true },
      });
      // automaticCampaignsEnabled sigue en su default true — no debería
      // afectar la lectura de "cerca del premio".
      await bootstrap.ensureDefaultRetentionSetup(businessId);

      const overview = await service.overview(businessId);

      expect(
        overview.automations.find((a) => a.key === 'cerca_del_premio')?.enabled,
      ).toBe(true);
    });
  });

  /**
   * Los tres writes (flags, kill switch, autorización) son UNA decisión del
   * dueño, así que van en una transacción. Sin eso, un fallo en el medio deja
   * estados que no representan ninguna decisión — el peor es el motor apagado
   * con los toggles prendidos: la pantalla diría "2 activas" y no saldría un
   * solo mensaje.
   */
  describe('atomicidad', () => {
    it('si un write intermedio falla, NO queda nada aplicado a medias', async () => {
      const businessId = await makeBusiness();
      const antesSettings = await settingsOf(businessId);
      const antesBusiness = await prisma.business.findUniqueOrThrow({
        where: { id: businessId },
      });

      // Se corre la transacción REAL, pero el último write de adentro (la
      // autorización de beneficios) explota. Los dos anteriores ya se
      // ejecutaron dentro de esa misma transacción, así que Postgres tiene
      // que revertirlos. Interceptar el cliente de la transacción es la única
      // forma de probar esto: un spy sobre `prisma.x` no aplica, porque
      // adentro de `$transaction` el cliente es otro objeto.
      const realTransaction = prisma.$transaction.bind(prisma);
      const spy = jest.spyOn(prisma, '$transaction').mockImplementationOnce(((
        callback: (tx: unknown) => unknown,
      ) =>
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        realTransaction(((tx: Record<string, unknown>) => {
          const failing = new Proxy(tx, {
            get(target, prop) {
              if (prop === 'retentionIncentiveDefinition') {
                return {
                  updateMany: () => Promise.reject(new Error('fallo simulado')),
                };
              }
              return target[prop as string];
            },
          });
          return callback(failing);
        }) as never)) as never);

      await expect(
        service.updateAutomations(businessId, {
          cercaDelPremio: true,
          teExtranamos: true,
          benefitIds: [],
        }),
      ).rejects.toThrow('fallo simulado');

      spy.mockRestore();

      const despuesSettings = await settingsOf(businessId);
      const despuesBusiness = await prisma.business.findUniqueOrThrow({
        where: { id: businessId },
      });

      expect(despuesSettings.progressReminderEnabled).toBe(
        antesSettings.progressReminderEnabled,
      );
      expect(despuesSettings.automaticCampaignsEnabled).toBe(
        antesSettings.automaticCampaignsEnabled,
      );
      expect(despuesBusiness.retentionEngineV2Enabled).toBe(
        antesBusiness.retentionEngineV2Enabled,
      );
    });

    it('cuando todo sale bien, los tres writes quedan aplicados juntos', async () => {
      const businessId = await makeBusiness();
      const incentive = await makeIncentive(businessId, 'Café gratis');

      await service.updateAutomations(businessId, {
        cercaDelPremio: true,
        teExtranamos: true,
        benefitIds: [incentive.id],
        automaticIncentiveMonthlyLimit: 10,
      });

      const settings = await settingsOf(businessId);
      const business = await prisma.business.findUniqueOrThrow({
        where: { id: businessId },
      });
      const authorized =
        await prisma.retentionIncentiveDefinition.findUniqueOrThrow({
          where: { id: incentive.id },
        });

      expect(settings.progressReminderEnabled).toBe(true);
      expect(settings.automaticCampaignsEnabled).toBe(true);
      expect(business.retentionEngineV2Enabled).toBe(true);
      expect(authorized.automationEligible).toBe(true);
    });
  });

  // ── Beneficios autorizados ──────────────────────────────────────────────

  describe('beneficios autorizados', () => {
    it('solo los elegidos quedan usables por la reactivación', async () => {
      const businessId = await makeBusiness();
      const a = await makeIncentive(businessId, '10% de descuento');
      const b = await makeIncentive(businessId, 'Cappuccino gratis');
      await makeIncentive(businessId, '2x1 en medialunas');

      await service.updateAutomations(businessId, {
        teExtranamos: true,
        benefitIds: [a.id, b.id],
        automaticIncentiveMonthlyLimit: 10,
      });

      const authorized = await prisma.retentionIncentiveDefinition.findMany({
        where: { businessId, automationEligible: true },
        select: { name: true },
      });
      expect(authorized.map((x) => x.name).sort()).toEqual([
        '10% de descuento',
        'Cappuccino gratis',
      ]);
    });

    /**
     * Lo único que Retention V2 lee es `automationEligible`. Un beneficio que
     * no pasó por acá tiene ese flag en false y el motor no puede ofrecerlo,
     * exista o no en el catálogo.
     */
    it('un beneficio NO autorizado nunca queda elegible', async () => {
      const businessId = await makeBusiness();
      const a = await makeIncentive(businessId, 'Autorizado');
      const b = await makeIncentive(businessId, 'Jamás autorizado');

      await service.updateAutomations(businessId, {
        benefitIds: [a.id],
        automaticIncentiveMonthlyLimit: 10,
      });

      const nunca = await prisma.retentionIncentiveDefinition.findUniqueOrThrow(
        { where: { id: b.id } },
      );
      expect(nunca.automationEligible).toBe(false);
    });

    it('cambiar de opinión desautoriza lo anterior — no se acumula', async () => {
      const businessId = await makeBusiness();
      const a = await makeIncentive(businessId, 'Primero');
      const b = await makeIncentive(businessId, 'Después');

      await service.updateAutomations(businessId, {
        benefitIds: [a.id],
        automaticIncentiveMonthlyLimit: 10,
      });
      await service.updateAutomations(businessId, { benefitIds: [b.id] });

      const authorized = await prisma.retentionIncentiveDefinition.findMany({
        where: { businessId, automationEligible: true },
        select: { name: true },
      });
      expect(authorized.map((x) => x.name)).toEqual(['Después']);
    });

    it('lista vacía = solo recordatorios, sin ningún beneficio', async () => {
      const businessId = await makeBusiness();
      const a = await makeIncentive(businessId, 'Algo');
      await service.updateAutomations(businessId, {
        benefitIds: [a.id],
        automaticIncentiveMonthlyLimit: 10,
      });

      await service.updateAutomations(businessId, { benefitIds: [] });

      expect(
        await prisma.retentionIncentiveDefinition.count({
          where: { businessId, automationEligible: true },
        }),
      ).toBe(0);
    });

    it('un beneficio de OTRO negocio no puede autorizarse', async () => {
      const negocioA = await makeBusiness();
      const negocioB = await makeBusiness();
      const ajeno = await makeIncentive(negocioB, 'Beneficio de B');

      await service.updateAutomations(negocioA, { benefitIds: [ajeno.id] });

      const sigueApagado =
        await prisma.retentionIncentiveDefinition.findUniqueOrThrow({
          where: { id: ajeno.id },
        });
      expect(sigueApagado.automationEligible).toBe(false);
    });

    it('el catálogo que muestra Notificaciones es el de Programa, no uno propio', async () => {
      const businessId = await makeBusiness();
      await makeIncentive(businessId, 'Del catálogo de Programa');

      const overview = await service.overview(businessId);

      expect(overview.benefits).toHaveLength(1);
      expect(overview.benefits[0].name).toBe('Del catálogo de Programa');
      expect(overview.benefits[0].authorized).toBe(false);
      // No se creó ningún Benefit extra al mostrarlo.
      expect(await prisma.benefit.count({ where: { businessId } })).toBe(1);
    });
  });

  // ── Vocabulario ─────────────────────────────────────────────────────────

  describe('el vocabulario interno no sale al panel', () => {
    const PROHIBIDAS = [
      'objective',
      'experiment',
      'variant',
      'CONTROL',
      'treatment',
      'allocation',
      'optimization',
      'uplift',
      'pValue',
      'p-value',
      'dryRun',
      'dry_run',
      'AT_RISK',
      'INACTIVE',
      'REWARD_GOAL_PROGRESS',
      'segment',
    ];

    it('overview no contiene ninguna palabra del motor', async () => {
      const businessId = await makeBusiness();
      await makeIncentive(businessId, 'Café gratis');
      await service.updateAutomations(businessId, { teExtranamos: true });

      const serialized = JSON.stringify(await service.overview(businessId));

      for (const word of PROHIBIDAS) {
        expect(serialized).not.toContain(word);
      }
    });

    it('settings tampoco: solo horarios y frecuencia', async () => {
      const businessId = await makeBusiness();

      const settings = await service.settings(businessId);
      const serialized = JSON.stringify(settings);

      for (const word of PROHIBIDAS) {
        expect(serialized).not.toContain(word);
      }
      // Y lo que sí tiene que estar.
      expect(settings).toHaveProperty('sendingHourStart');
      expect(settings).toHaveProperty('maximumMessagesPer30Days');
    });

    it('"modo de prueba" reemplaza a dry run, con esas palabras', async () => {
      const businessId = await makeBusiness();
      await prisma.retentionSettings.update({
        where: { businessId },
        data: { dryRunEnabled: true },
      });

      const overview = await service.overview(businessId);

      expect(overview.status.testMode).toBe(true);
      expect(JSON.stringify(overview)).not.toContain('dryRun');
    });
  });

  // ── Configuración visible ───────────────────────────────────────────────

  describe('configuración', () => {
    it('guarda horarios y frecuencia', async () => {
      const businessId = await makeBusiness();

      await service.updateSettings(businessId, {
        sendingHourStart: 11,
        sendingHourEnd: 19,
        allowedSendingDays: [1, 2, 3, 4, 5],
        minimumDaysBetweenMessages: 21,
        maximumMessagesPer30Days: 1,
      });

      const s = await settingsOf(businessId);
      expect(s.sendingHourStart).toBe(11);
      expect(s.sendingHourEnd).toBe(19);
      expect(s.allowedSendingDays).toEqual([1, 2, 3, 4, 5]);
      expect(s.minimumDaysBetweenRetentionMessages).toBe(21);
      expect(s.maximumRetentionMessagesPer30Days).toBe(2 - 1);
    });

    /**
     * La lista blanca no es decorativa: el endpoint del dueño no puede tocar
     * el grupo de control ni el modo de optimización ni por accidente.
     */
    it('NO puede tocar control, optimización ni presupuesto', async () => {
      const businessId = await makeBusiness();
      const antes = await settingsOf(businessId);

      await service.updateSettings(businessId, {
        sendingHourStart: 9,
        // Campos que no existen en el DTO — llegan y se ignoran.
        controlGroupPercent: 0,
        optimizationMode: 'AUTOMATIC',
        maxAutomatedIncentivesPerMonth: 99999,
      } as never);

      const despues = await settingsOf(businessId);
      expect(despues.sendingHourStart).toBe(9);
      expect(despues.controlGroupPercent).toBe(antes.controlGroupPercent);
      expect(despues.optimizationMode).toBe(antes.optimizationMode);
      expect(despues.maxAutomatedIncentivesPerMonth).toBe(
        antes.maxAutomatedIncentivesPerMonth,
      );
    });
  });

  // ── Estados sin datos ───────────────────────────────────────────────────

  describe('estados sin datos', () => {
    it('un negocio sin settings devuelve defaults en vez de explotar', async () => {
      const business = await prisma.business.create({
        data: {
          id: randomUUID(),
          name: 'Sin settings',
          slug: `nos-${randomUUID().slice(0, 8)}`,
          status: BusinessStatus.ACTIVE,
          country: 'UY',
          currency: 'UYU',
          timezone: 'America/Montevideo',
          experienceVersion: ExperienceVersion.CHECKIN_V2,
        },
      });
      businesses.push(business.id);

      const overview = await service.overview(business.id);

      expect(overview.status.activeCount).toBe(0);
      // Sin fila de settings, `rewardGoalsEnabled` cae en su default (false)
      // — sellos apagados, así que "cerca del premio" ni aparece. Ver el
      // describe de sellos más abajo para el contrato completo.
      expect(overview.automations.map((a) => a.key)).toEqual(['te_extranamos']);
      expect(overview.benefits).toEqual([]);
    });

    it('sin resultados todavía, la señal es "aprendiendo" y no un cero intimidante', async () => {
      const businessId = await makeBusiness();

      const overview = await service.overview(businessId);

      expect(overview.results.signal).toBe('aprendiendo');
      expect(overview.results.contacted).toBe(0);
    });

    it('historial vacío devuelve lista vacía', async () => {
      const businessId = await makeBusiness();
      expect(await service.history(businessId)).toEqual([]);
    });
  });

  // ── Automatizaciones expuestas ──────────────────────────────────────────

  it('con sellos activos, expone EXACTAMENTE dos automatizaciones: las que existen', async () => {
    const businessId = await makeBusiness();
    await prisma.retentionSettings.update({
      where: { businessId },
      data: { rewardGoalsEnabled: true },
    });

    const overview = await service.overview(businessId);

    expect(overview.automations.map((a) => a.key)).toEqual([
      'cerca_del_premio',
      'te_extranamos',
    ]);
    // "Recordar recompensa disponible" no existe en el motor y no se inventa.
    expect(JSON.stringify(overview)).not.toContain('recompensa_disponible');
  });

  // ── §4/§9 — "Cerca del premio" no tiene sentido sin tarjeta de sellos ────

  describe('## Sellos', () => {
    it('sellos OFF: "cerca del premio" no aparece, ni activo ni inactivo', async () => {
      const businessId = await makeBusiness(); // rewardGoalsEnabled: false (default)
      await service.updateAutomations(businessId, {
        cercaDelPremio: true,
        teExtranamos: true,
      });

      const overview = await service.overview(businessId);

      expect(overview.automations.map((a) => a.key)).toEqual(['te_extranamos']);
    });

    it('sellos ON: "cerca del premio" aparece y refleja su propio interruptor', async () => {
      const businessId = await makeBusiness();
      await prisma.retentionSettings.update({
        where: { businessId },
        data: { rewardGoalsEnabled: true },
      });
      await service.updateAutomations(businessId, {
        cercaDelPremio: true,
        teExtranamos: false,
      });

      const overview = await service.overview(businessId);

      expect(
        overview.automations.find((a) => a.key === 'cerca_del_premio')?.enabled,
      ).toBe(true);
    });

    it('"te extrañamos" funciona igual sin importar si hay sellos o no', async () => {
      const businessId = await makeBusiness(); // sin sellos
      await service.updateAutomations(businessId, { teExtranamos: true });

      const overview = await service.overview(businessId);

      expect(
        overview.automations.find((a) => a.key === 'te_extranamos')?.enabled,
      ).toBe(true);
    });
  });

  // ── §8 — el canal es la única condición real de "puede mandar WhatsApp" ──

  describe('## Canal', () => {
    afterEach(() => {
      process.env.WHAPI_TOKEN = 'test-token'; // restaurado para el resto del archivo
    });

    it('sin proveedor configurado, el estado es "no_conectado" y ninguna automatización se muestra activa', async () => {
      const businessId = await makeBusiness();
      await service.updateAutomations(businessId, { teExtranamos: true });
      delete process.env.WHAPI_TOKEN;

      const overview = await service.overview(businessId);

      expect(overview.status.channel).toBe('no_conectado');
      expect(
        overview.automations.find((a) => a.key === 'te_extranamos')?.enabled,
      ).toBe(false);
    });

    it('con proveedor configurado, el estado es "activo"', async () => {
      const businessId = await makeBusiness();

      const overview = await service.overview(businessId);

      expect(overview.status.channel).toBe('activo');
    });

    it('el estado de canal nunca expone el nombre del proveedor ni variables técnicas', async () => {
      const businessId = await makeBusiness();

      const overview = await service.overview(businessId);
      const serialized = JSON.stringify(overview);

      expect(serialized).not.toMatch(/whapi/i);
      expect(serialized).not.toContain('WHAPI_TOKEN');
    });
  });

  // ── §16/§17 — "preparando": flags + canal OK, pero sin experiment todavía ──

  describe('## Preparando', () => {
    it('un negocio con los flags en true pero SIN setup real nunca se lee como Activo', async () => {
      const businessId = await makeBusiness();
      // Simula un negocio de antes de esta fase: los flags dicen que sí, pero
      // nunca pasó por un trigger que llamara al bootstrap (ver §10 — no se
      // auto-crea infraestructura para negocios existentes por migración).
      await prisma.business.update({
        where: { id: businessId },
        data: { retentionEngineV2Enabled: true },
      });

      const overview = await service.overview(businessId);

      const teExtranamos = overview.automations.find(
        (a) => a.key === 'te_extranamos',
      );
      expect(teExtranamos?.state).toBe('preparando');
      expect(teExtranamos?.enabled).toBe(false);
      expect(overview.status.activeCount).toBe(0);
    });

    it('una vez que el trigger real corre (updateAutomations), pasa a Activo', async () => {
      const businessId = await makeBusiness();

      const overview = await service.updateAutomations(businessId, {
        teExtranamos: true,
      });

      expect(
        overview.automations.find((a) => a.key === 'te_extranamos')?.state,
      ).toBe('activo');
    });

    it('"preparando" nunca aparece si la automatización está apagada — ahí es "desactivado"', async () => {
      const businessId = await makeBusiness();
      await prisma.retentionSettings.update({
        where: { businessId },
        data: { automaticCampaignsEnabled: false },
      });

      const overview = await service.overview(businessId);

      expect(
        overview.automations.find((a) => a.key === 'te_extranamos')?.state,
      ).toBe('desactivado');
    });
  });

  // ── §1-§11 (fase de presupuesto) ─────────────────────────────────────────

  describe('## Budget', () => {
    it('sin_autorizar: 0 beneficios autorizados, sin importar el presupuesto', async () => {
      const businessId = await makeBusiness();

      const overview = await service.overview(businessId);

      expect(overview.benefitsAutomation.status).toBe('sin_autorizar');
    });

    it('necesita_limite: hay autorizado pero ningún cap (estado legado, ya no alcanzable por escritura)', async () => {
      const businessId = await makeBusiness();
      const a = await makeIncentive(businessId, 'Café gratis');
      // Escritura directa — el servicio ya no permite llegar a este estado
      // por su propia API; esto reproduce un negocio de ANTES del guardrail.
      await prisma.retentionIncentiveDefinition.update({
        where: { id: a.id },
        data: { automationEligible: true },
      });

      const overview = await service.overview(businessId);

      expect(overview.benefitsAutomation.status).toBe('necesita_limite');
    });

    it('listo: autorizado + cap configurado + todavía no se alcanzó', async () => {
      const businessId = await makeBusiness();
      const a = await makeIncentive(businessId, 'Café gratis');
      await service.updateAutomations(businessId, {
        benefitIds: [a.id],
        automaticIncentiveMonthlyLimit: 10,
      });

      const overview = await service.overview(businessId);

      expect(overview.benefitsAutomation.status).toBe('listo');
      expect(overview.benefitsAutomation.monthlyLimit).toBe(10);
      expect(overview.benefitsAutomation.usedThisMonth).toBe(0);
    });

    it('limite_alcanzado: el uso de este mes llega al límite configurado', async () => {
      const businessId = await makeBusiness();
      const a = await makeIncentive(businessId, 'Café gratis');
      await service.updateAutomations(businessId, {
        benefitIds: [a.id],
        automaticIncentiveMonthlyLimit: 1,
      });
      await issueOneBenefit(businessId, a.id);

      const overview = await service.overview(businessId);

      expect(overview.benefitsAutomation.status).toBe('limite_alcanzado');
      expect(overview.benefitsAutomation.usedThisMonth).toBe(1);
    });

    it('rechaza autorizar el primer beneficio sin límite y sin cap previo — no queda nada escrito', async () => {
      const businessId = await makeBusiness();
      const a = await makeIncentive(businessId, 'Café gratis');

      await expect(
        service.updateAutomations(businessId, { benefitIds: [a.id] }),
      ).rejects.toThrow(/límite mensual/);

      const stillUnauthorized =
        await prisma.retentionIncentiveDefinition.findUniqueOrThrow({
          where: { id: a.id },
        });
      expect(stillUnauthorized.automationEligible).toBe(false);
      // Tampoco tocó los otros flags de la misma llamada.
      const settings = await settingsOf(businessId);
      expect(settings.automaticCampaignsEnabled).toBe(true); // default, intacto
    });

    it('autorizar + configurar el límite en la MISMA llamada funciona atómicamente', async () => {
      const businessId = await makeBusiness();
      const a = await makeIncentive(businessId, 'Café gratis');

      const overview = await service.updateAutomations(businessId, {
        benefitIds: [a.id],
        automaticIncentiveMonthlyLimit: 5,
      });

      expect(overview.benefitsAutomation.status).toBe('listo');
      expect(overview.benefitsAutomation.monthlyLimit).toBe(5);
      const authorized =
        await prisma.retentionIncentiveDefinition.findUniqueOrThrow({
          where: { id: a.id },
        });
      expect(authorized.automationEligible).toBe(true);
    });

    it('desautorizar todo nunca exige un límite', async () => {
      const businessId = await makeBusiness();
      const a = await makeIncentive(businessId, 'Café gratis');
      await service.updateAutomations(businessId, {
        benefitIds: [a.id],
        automaticIncentiveMonthlyLimit: 5,
      });

      await expect(
        service.updateAutomations(businessId, { benefitIds: [] }),
      ).resolves.toBeDefined();
    });

    it('registra un ProgramAuditEvent cuando el límite realmente cambia', async () => {
      const businessId = await makeBusiness();
      const a = await makeIncentive(businessId, 'Café gratis');

      // `actorUserId` queda undefined a propósito — la fila real tiene FK a
      // `User`, y lo que se prueba acá es que el evento se registra, no el
      // enlace de autoría.
      await service.updateAutomations(businessId, {
        benefitIds: [a.id],
        automaticIncentiveMonthlyLimit: 5,
      });
      await service.updateAutomations(businessId, {
        automaticIncentiveMonthlyLimit: 10,
      });

      const events = await prisma.programAuditEvent.findMany({
        where: { businessId, type: 'automation_incentive_limit_changed' },
      });
      expect(events).toHaveLength(2); // 1 en la creación, 1 en el cambio a 10
    });

    it('NO registra un ProgramAuditEvent si se manda el mismo valor de nuevo', async () => {
      const businessId = await makeBusiness();
      const a = await makeIncentive(businessId, 'Café gratis');
      await service.updateAutomations(businessId, {
        benefitIds: [a.id],
        automaticIncentiveMonthlyLimit: 5,
      });

      await service.updateAutomations(businessId, {
        automaticIncentiveMonthlyLimit: 5,
      });

      const events = await prisma.programAuditEvent.count({
        where: { businessId, type: 'automation_incentive_limit_changed' },
      });
      expect(events).toBe(1); // solo el de la primera vez
    });

    it('el límite mensual nunca expone el tope monetario ni vocabulario de presupuesto interno', async () => {
      const businessId = await makeBusiness();

      const overview = await service.overview(businessId);
      const serialized = JSON.stringify(overview);

      expect(serialized).not.toContain('maxEstimatedIncentiveCostPerMonth');
      expect(serialized).not.toContain('estimatedCost');
      expect(serialized).not.toContain('budget');
    });
  });

  // ── Auditoría de toggles — el hallazgo real de esta tanda: sin esto,
  // "el dueño lo apagó" y "nunca se inicializó" dejan el mismo booleano en
  // la base y son indistinguibles después de los hechos.

  describe('## Causa de toggles OFF — auditoría', () => {
    /** Post-onboarding simulado — mismo patrón que el resto del archivo. */
    async function makeActivatedBusiness() {
      const businessId = await makeBusiness();
      await prisma.business.update({
        where: { id: businessId },
        data: { retentionEngineV2Enabled: true },
      });
      await bootstrap.ensureDefaultRetentionSetup(businessId);
      return businessId;
    }

    it('apagar Te extrañamos queda auditado, y una lectura posterior lo sigue mostrando OFF', async () => {
      const businessId = await makeActivatedBusiness();
      const before = await service.overview(businessId);
      expect(
        before.automations.find((a) => a.key === 'te_extranamos')?.state,
      ).toBe('activo');

      await service.updateAutomations(businessId, { teExtranamos: false });

      const after = await service.overview(businessId);
      expect(
        after.automations.find((a) => a.key === 'te_extranamos')?.state,
      ).toBe('desactivado');
      // Una segunda lectura (otro request) — nada la reactiva sola.
      const again = await service.overview(businessId);
      expect(
        again.automations.find((a) => a.key === 'te_extranamos')?.state,
      ).toBe('desactivado');

      const events = await prisma.programAuditEvent.findMany({
        where: { businessId, type: 'automation_toggled' },
      });
      expect(events).toHaveLength(1);
      expect(events[0].message).toBe('Desactivaste Te extrañamos');
      expect(events[0].metadata).toMatchObject({
        automation: 'te_extranamos',
        enabled: false,
      });
    });

    it('activar Cerca del premio (con sellos) también queda auditado', async () => {
      const businessId = await makeBusiness();
      await prisma.retentionSettings.update({
        where: { businessId },
        data: { rewardGoalsEnabled: true },
      });

      await service.updateAutomations(businessId, { cercaDelPremio: true });

      const events = await prisma.programAuditEvent.findMany({
        where: { businessId, type: 'automation_toggled' },
      });
      expect(events).toHaveLength(1);
      expect(events[0].message).toBe('Activaste Cerca del premio');
    });

    it('reafirmar el mismo valor NO registra un evento nuevo (§13: no ampliar el log con reafirmaciones)', async () => {
      const businessId = await makeBusiness();
      // `automaticCampaignsEnabled` ya es `true` por default — esto no
      // cambia nada de verdad.
      await service.updateAutomations(businessId, { teExtranamos: true });

      const events = await prisma.programAuditEvent.count({
        where: { businessId, type: 'automation_toggled' },
      });
      expect(events).toBe(0);
    });

    it('cambiar SOLO el límite mensual no genera un evento de toggle (son campos independientes)', async () => {
      const businessId = await makeBusiness();
      const a = await makeIncentive(businessId, 'Café gratis');

      await service.updateAutomations(businessId, {
        benefitIds: [a.id],
        automaticIncentiveMonthlyLimit: 5,
      });

      const toggleEvents = await prisma.programAuditEvent.count({
        where: { businessId, type: 'automation_toggled' },
      });
      expect(toggleEvents).toBe(0);
    });
  });

  // ── Defaults del onboarding self-service (§1) — Te extrañamos ON siempre;
  // Cerca del premio ON solo con sellos activos. Sin sobreescribir nunca una
  // decisión manual (la sección de arriba prueba justamente eso: apagado a
  // mano permanece apagado).

  describe('## Defaults', () => {
    it('benefits-only (sin sellos): Te extrañamos ON, Cerca del premio ni siquiera existe como concepto', async () => {
      const businessId = await makeBusiness();
      await prisma.business.update({
        where: { id: businessId },
        data: { retentionEngineV2Enabled: true },
      });
      await bootstrap.ensureDefaultRetentionSetup(businessId);

      const overview = await service.overview(businessId);
      expect(
        overview.automations.find((a) => a.key === 'te_extranamos')?.state,
      ).toBe('activo');
      expect(
        overview.automations.some((a) => a.key === 'cerca_del_premio'),
      ).toBe(false);
    });

    it('con sellos activos: Te extrañamos ON Y Cerca del premio ON', async () => {
      const businessId = await makeBusiness();
      await prisma.retentionSettings.update({
        where: { businessId },
        data: { rewardGoalsEnabled: true, progressReminderEnabled: true },
      });
      await prisma.business.update({
        where: { id: businessId },
        data: { retentionEngineV2Enabled: true },
      });
      await bootstrap.ensureDefaultRetentionSetup(businessId);

      const overview = await service.overview(businessId);
      expect(
        overview.automations.find((a) => a.key === 'te_extranamos')?.state,
      ).toBe('activo');
      expect(
        overview.automations.find((a) => a.key === 'cerca_del_premio')?.state,
      ).toBe('activo');
    });
  });
});
