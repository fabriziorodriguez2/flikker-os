import { NotFoundException } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';

const DRAFT = {
  id: 'biz-1',
  name: 'Café Uno',
  loyaltyCardColor: null,
  googleBusinessProfileUrl: null,
  welcomeBenefitId: null,
  welcomeGiftDecided: false,
  notificationsDecided: false,
};

function makeDeps(options: { draft?: unknown } = {}) {
  const prisma = {
    business: {
      findFirst: jest
        .fn()
        .mockResolvedValue(options.draft === undefined ? DRAFT : options.draft),
      create: jest.fn().mockResolvedValue({ id: 'biz-new' }),
      update: jest.fn().mockResolvedValue({ id: 'biz-1' }),
    },
    membership: { upsert: jest.fn().mockResolvedValue({}) },
    retentionSettings: {
      upsert: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue({
        rewardGoalsEnabled: false,
        rewardGoalMinVisits: null,
        rewardGoalFeedbackBonusEnabled: false,
        automaticCampaignsEnabled: false,
      }),
    },
    retentionIncentiveDefinition: {
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    visitSource: { findFirst: jest.fn().mockResolvedValue({ token: 'tok-1' }) },
    benefit: {
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'ben-new' }),
    },
  };
  const visitSources = {
    ensureDefaultSource: jest.fn().mockResolvedValue({ token: 'tok-1' }),
  };
  const benefits = { setRetentionBridge: jest.fn().mockResolvedValue({}) };
  return { prisma, visitSources, benefits };
}

const service = (d: ReturnType<typeof makeDeps>) =>
  new OnboardingService(
    d.prisma as never,
    d.visitSources as never,
    d.benefits as never,
  );

const BUSINESS_DTO = { name: 'Café Uno', category: 'cafeteria' };

describe('Onboarding — paso 1 deja el negocio listo para funcionar', () => {
  it('crea el negocio en CHECKIN_V2, con OWNER, settings y QR principal', async () => {
    const deps = makeDeps({ draft: null });
    // Tras crear, `getState` vuelve a buscar y ya encuentra el borrador.
    deps.prisma.business.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValue(DRAFT);

    await service(deps).saveBusiness('user-1', BUSINESS_DTO);

    expect(deps.prisma.business.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ experienceVersion: 'CHECKIN_V2' }),
      }),
    );
    expect(deps.prisma.membership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ role: 'OWNER', status: 'ACTIVE' }),
      }),
    );
    expect(deps.prisma.retentionSettings.upsert).toHaveBeenCalled();
    expect(deps.visitSources.ensureDefaultSource).toHaveBeenCalled();
  });

  it('IDEMPOTENTE: si ya hay un borrador, lo actualiza en vez de crear otro', async () => {
    const deps = makeDeps(); // findFirst ya devuelve un borrador

    await service(deps).saveBusiness('user-1', BUSINESS_DTO);

    expect(deps.prisma.business.create).not.toHaveBeenCalled();
    expect(deps.prisma.business.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'biz-1' } }),
    );
  });

  it('un negocio ya completado NO es candidato a reanudar', async () => {
    const deps = makeDeps({ draft: null });
    deps.prisma.business.findFirst.mockResolvedValue(null);

    await service(deps).saveBusiness('user-1', BUSINESS_DTO);

    // El filtro `onboardingCompletedAt: null` es lo que lo garantiza.
    expect(deps.prisma.business.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ onboardingCompletedAt: null }),
      }),
    );
  });
});

describe('Onboarding — paso 2 configura el programa', () => {
  it('crea la recompensa, la autoriza como tarjeta y guarda los sellos', async () => {
    const deps = makeDeps();

    await service(deps).saveProgram('user-1', {
      rewardTitle: '3 medialunas',
      stampsRequired: 5,
      feedbackBonusEnabled: true,
    });

    expect(deps.benefits.setRetentionBridge).toHaveBeenCalledWith(
      'biz-1',
      'ben-new',
      { rewardGoalEligible: true },
    );
    expect(deps.prisma.retentionSettings.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rewardGoalsEnabled: true,
          rewardGoalMinVisits: 5,
          rewardGoalMaxVisits: 5,
          rewardGoalFeedbackBonusEnabled: true,
        }),
      }),
    );
  });

  it('IDEMPOTENTE: reenviar el mismo título reusa el beneficio, no lo duplica', async () => {
    const deps = makeDeps();
    deps.prisma.benefit.findFirst.mockResolvedValue({ id: 'ben-existente' });

    await service(deps).saveProgram('user-1', {
      rewardTitle: '3 medialunas',
      stampsRequired: 5,
    });

    expect(deps.prisma.benefit.create).not.toHaveBeenCalled();
    expect(deps.benefits.setRetentionBridge).toHaveBeenCalledWith(
      'biz-1',
      'ben-existente',
      { rewardGoalEligible: true },
    );
  });

  it('deja UNA sola recompensa autorizada: apaga las anteriores', async () => {
    const deps = makeDeps();

    await service(deps).saveProgram('user-1', {
      rewardTitle: 'Nueva',
      stampsRequired: 5,
    });

    expect(
      deps.prisma.retentionIncentiveDefinition.updateMany,
    ).toHaveBeenCalledWith({
      where: { businessId: 'biz-1', rewardGoalEligible: true },
      data: { rewardGoalEligible: false },
    });
  });

  it('sin recompensa elegida ni creada, falla en vez de dejar el programa a medias', async () => {
    const deps = makeDeps();

    await expect(
      service(deps).saveProgram('user-1', { stampsRequired: 5 }),
    ).rejects.toThrow();
    expect(deps.prisma.retentionSettings.update).not.toHaveBeenCalled();
  });
});

describe('Onboarding — paso 3 regalo de bienvenida (reanudación)', () => {
  /**
   * El punto de todo este paso: "no quiero regalo" tiene que ser una decisión
   * guardada, no la ausencia de una. Si solo mirásemos `welcomeBenefitId`,
   * "todavía no le preguntamos" y "dijo que no" serían el mismo estado y el
   * wizard volvería a preguntar en cada refresh, para siempre.
   */
  it('"no quiero regalo" se persiste como decisión, no como campo vacío', async () => {
    const deps = makeDeps();

    await service(deps).saveWelcomeGift('user-1', { wantsGift: false });

    expect(deps.prisma.business.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { welcomeBenefitId: null, welcomeGiftDecided: true },
      }),
    );
    expect(deps.prisma.benefit.create).not.toHaveBeenCalled();
  });

  it('elegir un regalo guarda el beneficio Y marca la decisión', async () => {
    const deps = makeDeps();

    await service(deps).saveWelcomeGift('user-1', {
      wantsGift: true,
      title: 'Café de bienvenida',
    });

    expect(deps.prisma.business.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { welcomeBenefitId: 'ben-new', welcomeGiftDecided: true },
      }),
    );
  });

  it('decir que sí sin elegir nada falla en vez de guardar una decisión falsa', async () => {
    const deps = makeDeps();

    await expect(
      service(deps).saveWelcomeGift('user-1', { wantsGift: true }),
    ).rejects.toThrow();
    expect(deps.prisma.business.update).not.toHaveBeenCalled();
  });

  it('REANUDACIÓN: getState distingue los tres estados de la bienvenida', async () => {
    // (a) programa guardado, bienvenida sin decidir
    const pending = makeDeps();
    let state = await service(pending).getState('user-1');
    expect(state.steps.welcomeGift).toBe(false);
    expect(state.program?.welcomeGiftDecided).toBe(false);

    // (b) dijo explícitamente que NO
    const said_no = makeDeps({
      draft: { ...DRAFT, welcomeGiftDecided: true, welcomeBenefitId: null },
    });
    state = await service(said_no).getState('user-1');
    expect(state.steps.welcomeGift).toBe(true);
    expect(state.program?.welcomeBenefitId).toBeNull();

    // (c) eligió un regalo
    const chose = makeDeps({
      draft: { ...DRAFT, welcomeGiftDecided: true, welcomeBenefitId: 'ben-x' },
    });
    state = await service(chose).getState('user-1');
    expect(state.steps.welcomeGift).toBe(true);
    expect(state.program?.welcomeBenefitId).toBe('ben-x');
  });

  it('saveProgram ya NO toca la bienvenida: son pasos separados', async () => {
    const deps = makeDeps();

    await service(deps).saveProgram('user-1', {
      rewardTitle: 'Recompensa',
      stampsRequired: 5,
    });

    const wroteWelcome = deps.prisma.business.update.mock.calls.some(
      (call: unknown[]) =>
        JSON.stringify(call[0] ?? {}).includes('welcomeBenefitId'),
    );
    expect(wroteWelcome).toBe(false);
  });
});

describe('Onboarding — paso 5 Google', () => {
  const save = (url: string) =>
    service(makeDeps()).saveGoogle('user-1', {
      googleBusinessProfileUrl: url,
    });

  it.each([
    'https://g.page/mi-cafe',
    'https://maps.app.goo.gl/AbCdEf123',
    'https://www.google.com/maps/place/Mi+Cafe/@-34.9,-56.1,17z',
    'https://www.google.com.uy/maps/place/Mi+Cafe',
    'https://search.google.com/local/writereview?placeid=ChIJxxx',
    'g.page/mi-cafe',
  ])('acepta un link legítimo de Google: %s', async (url) => {
    await expect(save(url)).resolves.toBeDefined();
  });

  it('rechaza un link que no es de Google, con mensaje entendible', async () => {
    await expect(save('https://facebook.com/mi-cafe')).rejects.toThrow(
      /no es de Google/,
    );
  });

  it('rechaza texto que no es una URL', async () => {
    await expect(save('mi cafe montevideo')).rejects.toThrow(
      /dirección web|https/,
    );
  });

  it('vacío es válido: "configurar más tarde" sigue siendo una salida', async () => {
    const deps = makeDeps();
    await service(deps).saveGoogle('user-1', {
      googleBusinessProfileUrl: '  ',
    });

    expect(deps.prisma.business.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ googleBusinessProfileUrl: null }),
      }),
    );
  });
});

describe('Onboarding — paso 6 notificaciones', () => {
  it('reactivación ON prende el motor y autoriza SOLO los beneficios elegidos', async () => {
    const deps = makeDeps();

    await service(deps).saveNotifications('user-1', {
      reactivateInactive: true,
      reactivationBenefitIds: ['ben-a', 'ben-b'],
    });

    expect(deps.prisma.business.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ retentionEngineV2Enabled: true }),
      }),
    );
    // Primero apaga todo, después autoriza explícitamente: el motor nunca
    // hereda una autorización vieja.
    expect(
      deps.prisma.retentionIncentiveDefinition.updateMany,
    ).toHaveBeenCalledWith({
      where: { businessId: 'biz-1', automationEligible: true },
      data: { automationEligible: false },
    });
    expect(deps.benefits.setRetentionBridge).toHaveBeenCalledTimes(2);
  });

  it('reactivación OFF deja el motor apagado y sin ningún beneficio autorizado', async () => {
    const deps = makeDeps();

    await service(deps).saveNotifications('user-1', {
      reactivateInactive: false,
    });

    expect(deps.prisma.business.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ retentionEngineV2Enabled: false }),
      }),
    );
    expect(deps.benefits.setRetentionBridge).not.toHaveBeenCalled();
  });

  /**
   * Los dos toggles tienen que ser realmente dos. Antes ambos terminaban en
   * `automaticCampaignsEnabled`, así que prender "recordar cerca del premio"
   * también salía a reactivar gente que se fue — dos decisiones muy distintas
   * del dueño colgando de un solo flag.
   */
  it('INDEPENDENCIA: "cerca del premio" ON y "reactivar" OFF no se pisan', async () => {
    const deps = makeDeps();

    await service(deps).saveNotifications('user-1', {
      remindNearReward: true,
      reactivateInactive: false,
    });

    expect(deps.prisma.retentionSettings.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          progressReminderEnabled: true,
          automaticCampaignsEnabled: false,
        },
      }),
    );
    // El kill switch se prende porque SÍ hay una automatización activa.
    expect(deps.prisma.business.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ retentionEngineV2Enabled: true }),
      }),
    );
    expect(deps.benefits.setRetentionBridge).not.toHaveBeenCalled();
  });

  it('INDEPENDENCIA: "reactivar" ON y "cerca del premio" OFF no se pisan', async () => {
    const deps = makeDeps();

    await service(deps).saveNotifications('user-1', {
      remindNearReward: false,
      reactivateInactive: true,
    });

    expect(deps.prisma.retentionSettings.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          progressReminderEnabled: false,
          automaticCampaignsEnabled: true,
        },
      }),
    );
  });

  it('los dos apagados dejan el motor apagado', async () => {
    const deps = makeDeps();

    await service(deps).saveNotifications('user-1', {
      remindNearReward: false,
      reactivateInactive: false,
    });

    expect(deps.prisma.business.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ retentionEngineV2Enabled: false }),
      }),
    );
  });

  /**
   * El último caso de "decisión vs omisión" que quedaba abierto en el wizard.
   * Apagar las dos automatizaciones es una respuesta; si no se guardara como
   * tal, el paso quedaría pendiente y se volvería a preguntar en cada refresh.
   */
  it('OFF/OFF explícito marca el paso como decidido igual', async () => {
    const deps = makeDeps();

    await service(deps).saveNotifications('user-1', {
      remindNearReward: false,
      reactivateInactive: false,
    });

    expect(deps.prisma.business.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ notificationsDecided: true }),
      }),
    );
  });

  it('REANUDACIÓN: sin decidir el paso está pendiente; decidido no vuelve a preguntar', async () => {
    // Sin decidir — aunque los flags estén en false por defecto.
    const pending = makeDeps();
    expect(
      (await service(pending).getState('user-1')).steps.notifications,
    ).toBe(false);

    // Decidido con TODO apagado: el paso está completo igual. Es la
    // diferencia que este campo existe para expresar.
    const decidedOff = makeDeps({
      draft: { ...DRAFT, notificationsDecided: true },
    });
    expect(
      (await service(decidedOff).getState('user-1')).steps.notifications,
    ).toBe(true);
  });

  /**
   * `RetentionSettings.automaticCampaignsEnabled` tiene default `true` en el
   * schema. `ensureSettings` crea esa fila apenas se guarda el paso 1, mucho
   * antes de que el dueño llegue al paso 6 — sin este gate, "Reactivar
   * clientes" aparecería pre-tildado la primera vez que abre el paso, sin que
   * nadie lo haya elegido todavía.
   */
  it('sin decidir, los toggles del wizard arrancan en false aunque el default del schema sea true', async () => {
    const sinDecidir = makeDeps({
      draft: {
        ...DRAFT,
        notificationsDecided: false,
      },
    });
    // El mock simula la fila real: automaticCampaignsEnabled ya en true
    // (default del schema) porque `ensureSettings` la creó en el paso 1.
    sinDecidir.prisma.retentionSettings.findUnique.mockResolvedValue({
      rewardGoalsEnabled: false,
      rewardGoalMinVisits: null,
      rewardGoalFeedbackBonusEnabled: false,
      automaticCampaignsEnabled: true,
      progressReminderEnabled: false,
    });

    const state = await service(sinDecidir).getState('user-1');

    expect(state.automations).toEqual({
      remindNearReward: false,
      reactivateInactive: false,
    });
  });

  it('una vez decidido, el wizard SÍ refleja lo que el dueño eligió', async () => {
    const decidido = makeDeps({
      draft: { ...DRAFT, notificationsDecided: true },
    });
    decidido.prisma.retentionSettings.findUnique.mockResolvedValue({
      rewardGoalsEnabled: false,
      rewardGoalMinVisits: null,
      rewardGoalFeedbackBonusEnabled: false,
      automaticCampaignsEnabled: true,
      progressReminderEnabled: false,
    });

    const state = await service(decidido).getState('user-1');

    expect(state.automations).toEqual({
      remindNearReward: false,
      reactivateInactive: true,
    });
  });
});

describe('Onboarding — scoping y cierre', () => {
  it('sin borrador, los pasos 2-6 fallan con 404 en vez de tocar otro negocio', async () => {
    const deps = makeDeps({ draft: null });
    const svc = service(deps);

    await expect(
      svc.saveProgram('user-1', { rewardTitle: 'X', stampsRequired: 5 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.saveDesign('user-1', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(svc.complete('user-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('complete marca onboardingCompletedAt — deja de ser borrador', async () => {
    const deps = makeDeps();

    const result = await service(deps).complete('user-1');

    expect(deps.prisma.business.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { onboardingCompletedAt: expect.any(Date) },
      }),
    );
    expect(result).toEqual({ businessId: 'biz-1', completed: true });
  });

  /**
   * El wizard llama a `complete` ANTES de navegar. Si la respuesta se pierde
   * pero el write entró, el reintento no puede devolver 404 y dejar al dueño
   * trabado en la última pantalla con todo ya configurado.
   */
  it('complete es idempotente: reintentar después de completar devuelve lo mismo', async () => {
    const deps = makeDeps({ draft: null });
    // Ya no hay borrador, pero sí un negocio completado de este OWNER.
    deps.prisma.business.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'biz-1' });

    const result = await service(deps).complete('user-1');

    expect(result).toEqual({ businessId: 'biz-1', completed: true });
    expect(deps.prisma.business.update).not.toHaveBeenCalled();
  });

  it('getState sin borrador devuelve estado vacío, no explota', async () => {
    const deps = makeDeps({ draft: null });

    expect(await service(deps).getState('user-1')).toEqual({
      businessId: null,
      completed: false,
      steps: {},
    });
  });
});
