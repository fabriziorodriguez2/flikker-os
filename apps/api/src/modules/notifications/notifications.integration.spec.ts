import { randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { BenefitType, BusinessStatus, ExperienceVersion } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RetentionResultsOverviewService } from '../retention-v2/retention-results-overview.service';
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

  const businesses: string[] = [];

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        NotificationsService,
        {
          // Los resultados vienen del motor; acá solo se prueba la traducción.
          provide: RetentionResultsOverviewService,
          useValue: { forBusiness: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(NotificationsService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
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

    it('auto=true / engine=true → recién ahí se muestra ACTIVO', async () => {
      const businessId = await makeBusiness();
      await prisma.business.update({
        where: { id: businessId },
        data: { retentionEngineV2Enabled: true },
      });
      // automaticCampaignsEnabled ya es true por default.

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
        data: { progressReminderEnabled: true },
      });
      await prisma.business.update({
        where: { id: businessId },
        data: { retentionEngineV2Enabled: true },
      });
      // automaticCampaignsEnabled sigue en su default true — no debería
      // afectar la lectura de "cerca del premio".

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

      await service.updateAutomations(businessId, { benefitIds: [a.id] });

      const nunca = await prisma.retentionIncentiveDefinition.findUniqueOrThrow(
        { where: { id: b.id } },
      );
      expect(nunca.automationEligible).toBe(false);
    });

    it('cambiar de opinión desautoriza lo anterior — no se acumula', async () => {
      const businessId = await makeBusiness();
      const a = await makeIncentive(businessId, 'Primero');
      const b = await makeIncentive(businessId, 'Después');

      await service.updateAutomations(businessId, { benefitIds: [a.id] });
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
      await service.updateAutomations(businessId, { benefitIds: [a.id] });

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
      expect(overview.automations).toHaveLength(2);
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

  it('expone EXACTAMENTE dos automatizaciones: las que existen', async () => {
    const businessId = await makeBusiness();

    const overview = await service.overview(businessId);

    expect(overview.automations.map((a) => a.key)).toEqual([
      'cerca_del_premio',
      'te_extranamos',
    ]);
    // "Recordar recompensa disponible" no existe en el motor y no se inventa.
    expect(JSON.stringify(overview)).not.toContain('recompensa_disponible');
  });
});
