import { BenefitIssuanceSource, BenefitType } from '@prisma/client';
import { BenefitsService } from './benefits.service';

const NOW = new Date('2026-09-05T12:00:00.000Z');

function makeRepo(
  options: {
    welcomeBenefit?: unknown;
    participation?: unknown;
  } = {},
) {
  return {
    findWelcomeBenefit: jest.fn().mockResolvedValue(
      options.welcomeBenefit === undefined
        ? {
            welcomeBenefit: {
              id: 'ben-1',
              title: 'Café gratis',
              description: null,
              type: BenefitType.gift,
              active: true,
              startDate: null,
              endDate: null,
            },
          }
        : { welcomeBenefit: options.welcomeBenefit },
    ),
    ensureRedemptionCode: jest
      .fn()
      .mockResolvedValue({ id: 'p-1', redemptionCode: 'ABCD1234' }),
    findRedemption: jest
      .fn()
      .mockResolvedValue(
        options.participation === undefined
          ? { redemptionCode: 'ABCD1234', redeemedAt: null }
          : options.participation,
      ),
    setWelcomeBenefit: jest
      .fn()
      .mockResolvedValue({ welcomeBenefitId: 'ben-1' }),
    findOne: jest.fn(),
  };
}

// Ninguno de estos tests pasa por create/update/setRetentionBridge (los
// únicos que escriben en el historial o tocan presupuesto/bootstrap), así
// que stubs vacíos alcanzan. `getOrCreate` sí se usa (gate de
// `benefitsEnabled`) — default "prendido" para que estos tests sigan
// probando la lógica de bienvenida en sí, no el toggle nuevo. `plansBlocked`
// (default `false`) es el gate del trial de Beneficios — su propio describe
// block más abajo.
const service = (
  repo: ReturnType<typeof makeRepo>,
  benefitsEnabled = true,
  plansBlocked = false,
) =>
  new BenefitsService(
    repo as never,
    { record: jest.fn() } as never,
    {
      getOrCreate: jest.fn().mockResolvedValue({ benefitsEnabled }),
    } as never,
    {} as never,
    {
      isBenefitsBlocked: jest.fn().mockResolvedValue(plansBlocked),
    } as never,
  );

describe('Regalo de bienvenida — se entrega una sola vez', () => {
  it('emite el código en el primer registro', async () => {
    const repo = makeRepo();

    const result = await service(repo).grantWelcomeGift('biz-1', 'c-1', NOW);

    expect(repo.ensureRedemptionCode).toHaveBeenCalledWith(
      'biz-1',
      'ben-1',
      'c-1',
      BenefitIssuanceSource.WELCOME,
    );
    expect(result).toEqual({ benefitId: 'ben-1', code: 'ABCD1234' });
  });

  it('es idempotente: un segundo intento devuelve el MISMO código, no otro', async () => {
    const repo = makeRepo();
    const svc = service(repo);

    const first = await svc.grantWelcomeGift('biz-1', 'c-1', NOW);
    const second = await svc.grantWelcomeGift('biz-1', 'c-1', NOW);

    expect(first).toEqual(second);
    // `ensureRedemptionCode` reusa la participación existente — la unicidad
    // (benefitId, customerId) es la garantía real.
    expect(repo.ensureRedemptionCode).toHaveBeenCalledTimes(2);
  });

  it('no hace nada si el negocio no configuró regalo de bienvenida', async () => {
    const repo = makeRepo({ welcomeBenefit: null });

    const result = await service(repo).grantWelcomeGift('biz-1', 'c-1', NOW);

    expect(result).toBeNull();
    expect(repo.ensureRedemptionCode).not.toHaveBeenCalled();
  });

  it('no entrega un beneficio no canjeable (sorteo)', async () => {
    const repo = makeRepo({
      welcomeBenefit: {
        id: 'ben-1',
        title: 'Sorteo',
        type: BenefitType.raffle,
        active: true,
        startDate: null,
        endDate: null,
      },
    });

    expect(
      await service(repo).grantWelcomeGift('biz-1', 'c-1', NOW),
    ).toBeNull();
    expect(repo.ensureRedemptionCode).not.toHaveBeenCalled();
  });

  it('respeta la ventana de vigencia del beneficio', async () => {
    const expired = makeRepo({
      welcomeBenefit: {
        id: 'ben-1',
        title: 'Café gratis',
        type: BenefitType.gift,
        active: true,
        startDate: null,
        endDate: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    expect(
      await service(expired).grantWelcomeGift('biz-1', 'c-1', NOW),
    ).toBeNull();

    const notYet = makeRepo({
      welcomeBenefit: {
        id: 'ben-1',
        title: 'Café gratis',
        type: BenefitType.gift,
        active: true,
        startDate: new Date('2027-01-01T00:00:00.000Z'),
        endDate: null,
      },
    });
    expect(
      await service(notYet).grantWelcomeGift('biz-1', 'c-1', NOW),
    ).toBeNull();
  });
});

describe('Regalo de bienvenida — no reaparece en visitas posteriores', () => {
  it('se muestra mientras no fue canjeado', async () => {
    const repo = makeRepo();

    const state = await service(repo).getWelcomeGiftState('biz-1', 'c-1');

    expect(state).toMatchObject({ title: 'Café gratis', code: 'ABCD1234' });
  });

  it('DESAPARECE una vez canjeado — nunca se vuelve a ofrecer', async () => {
    const repo = makeRepo({
      participation: { redemptionCode: 'ABCD1234', redeemedAt: NOW },
    });

    expect(await service(repo).getWelcomeGiftState('biz-1', 'c-1')).toBeNull();
  });

  it('no se muestra a clientes que nunca lo recibieron (anteriores a la config)', async () => {
    const repo = makeRepo({ participation: null });

    expect(await service(repo).getWelcomeGiftState('biz-1', 'c-1')).toBeNull();
  });
});

describe('Regalo de bienvenida — independiente de Benefit.active', () => {
  it('setWelcomeGift NO toca `active`: escribe solo Business.welcomeBenefitId', async () => {
    const repo = makeRepo();
    repo.findOne.mockResolvedValue({ id: 'ben-1', type: BenefitType.gift });

    await service(repo).setWelcomeGift('biz-1', 'ben-1');

    expect(repo.setWelcomeBenefit).toHaveBeenCalledWith('biz-1', 'ben-1');
    // No existe ninguna llamada de activación/desactivación acá.
    expect(
      (repo as unknown as Record<string, unknown>).activate,
    ).toBeUndefined();
  });

  it('rechaza un tipo no canjeable como regalo de bienvenida', async () => {
    const repo = makeRepo();
    repo.findOne.mockResolvedValue({ id: 'ben-1', type: BenefitType.raffle });

    await expect(
      service(repo).setWelcomeGift('biz-1', 'ben-1'),
    ).rejects.toThrow();
  });

  it('permite limpiarlo con null', async () => {
    const repo = makeRepo();

    await service(repo).setWelcomeGift('biz-1', null);

    expect(repo.setWelcomeBenefit).toHaveBeenCalledWith('biz-1', null);
    expect(repo.findOne).not.toHaveBeenCalled();
  });
});

describe('Regalo de bienvenida — catálogo de Beneficios apagado (Programa → Configuración)', () => {
  it('grantWelcomeGift no entrega nada con benefitsEnabled: false', async () => {
    const repo = makeRepo();

    const result = await service(repo, false).grantWelcomeGift(
      'biz-1',
      'c-1',
      NOW,
    );

    expect(result).toBeNull();
    expect(repo.ensureRedemptionCode).not.toHaveBeenCalled();
  });

  it('getWelcomeGiftState no muestra nada con benefitsEnabled: false', async () => {
    const repo = makeRepo();

    const state = await service(repo, false).getWelcomeGiftState(
      'biz-1',
      'c-1',
    );

    expect(state).toBeNull();
    expect(repo.findWelcomeBenefit).not.toHaveBeenCalled();
  });

  it('reactivar benefitsEnabled restaura el mismo regalo sin reconfigurar nada', async () => {
    const repo = makeRepo();

    expect(
      await service(repo, false).grantWelcomeGift('biz-1', 'c-1', NOW),
    ).toBeNull();
    // `Business.welcomeBenefitId` nunca se tocó — reactivar el catálogo
    // vuelve a entregar el MISMO regalo, sin volver a configurarlo.
    const result = await service(repo, true).grantWelcomeGift(
      'biz-1',
      'c-1',
      NOW,
    );
    expect(result).toEqual({ benefitId: 'ben-1', code: 'ABCD1234' });
  });
});

describe('Regalo de bienvenida — trial de Beneficios vencido (sin Pro)', () => {
  it('grantWelcomeGift NO entrega un regalo nuevo con el trial vencido', async () => {
    const repo = makeRepo();

    const result = await service(repo, true, true).grantWelcomeGift(
      'biz-1',
      'c-1',
      NOW,
    );

    expect(result).toBeNull();
    expect(repo.ensureRedemptionCode).not.toHaveBeenCalled();
  });

  it('getWelcomeGiftState de un regalo YA entregado sigue funcionando aunque el trial esté vencido', async () => {
    // `getWelcomeGiftState` no pasa por el guard de Pro a propósito: es
    // solo LECTURA de una promesa ya hecha (`grantWelcomeGift` es lo único
    // que "entrega" algo nuevo), así que honra "ya emitidos siguen
    // canjeables" sin necesitar chequear el trial.
    const repo = makeRepo();

    const state = await service(repo, true, true).getWelcomeGiftState(
      'biz-1',
      'c-1',
    );

    expect(state).toMatchObject({ title: 'Café gratis', code: 'ABCD1234' });
  });
});
