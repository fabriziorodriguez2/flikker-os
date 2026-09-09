import { ExperienceVersion } from '@prisma/client';
import { CustomerPublicUrlService } from './customer-public-url.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { VisitSourcesService } from '../visit-sources/visit-sources.service';

/**
 * Única fuente de verdad para las URLs customer-facing (pedido explícito:
 * "Codex debe decidir base URL, experienceVersion, ruta correcta").
 *
 * Lo que importa acá es la decisión de ruta por `experienceVersion` — el
 * caso crítico del pedido es exactamente `resolveCheckinPath`/`resolveCheckinUrl`.
 */
function makeHarness() {
  const prisma = {
    business: {
      findUnique: jest.fn(),
    },
  };
  const visitSources = {
    ensureDefaultSource: jest
      .fn()
      .mockResolvedValue({ token: 'tok-principal' }),
  };
  const service = new CustomerPublicUrlService(
    prisma as unknown as PrismaService,
    visitSources as unknown as VisitSourcesService,
  );
  return { prisma, visitSources, service };
}

describe('CustomerPublicUrlService — ruta según experienceVersion', () => {
  afterEach(() => {
    delete process.env.APP_PUBLIC_URL;
    delete process.env.WEB_BASE_URL;
  });

  it('V2: resuelve /check-in/{token} de la fuente default — nunca /qr/', async () => {
    const { service, visitSources } = makeHarness();

    const path = await service.resolveCheckinPath({
      id: 'biz-1',
      experienceVersion: ExperienceVersion.CHECKIN_V2,
    });

    expect(path).toBe('/check-in/tok-principal');
    expect(visitSources.ensureDefaultSource).toHaveBeenCalledWith('biz-1');
  });

  it('LEGACY: resuelve /qr/{businessId} — nunca toca VisitSource', async () => {
    const { service, visitSources } = makeHarness();

    const path = await service.resolveCheckinPath({
      id: 'biz-1',
      experienceVersion: ExperienceVersion.LEGACY,
    });

    expect(path).toBe('/qr/biz-1');
    expect(visitSources.ensureDefaultSource).not.toHaveBeenCalled();
  });

  it('ensureDefaultSource es idempotente: dos llamados V2 seguidos reusan la misma fuente, nunca duplican', async () => {
    const { service, visitSources } = makeHarness();
    const business = {
      id: 'biz-1',
      experienceVersion: ExperienceVersion.CHECKIN_V2,
    };

    const first = await service.resolveCheckinPath(business);
    const second = await service.resolveCheckinPath(business);

    expect(first).toBe(second);
    expect(visitSources.ensureDefaultSource).toHaveBeenCalledTimes(2);
    // Mismo negocio en las dos llamadas — es `ensureDefaultSource` (ya
    // probado idempotente en `visit-sources.repository.ts`) quien garantiza
    // que las dos resuelvan a la MISMA fuente, nunca a dos nuevas.
    expect(visitSources.ensureDefaultSource).toHaveBeenNthCalledWith(
      1,
      'biz-1',
    );
    expect(visitSources.ensureDefaultSource).toHaveBeenNthCalledWith(
      2,
      'biz-1',
    );
  });

  it('checkinUrlByBusinessId: null si el negocio no existe, sin tirar', async () => {
    const { service, prisma } = makeHarness();
    prisma.business.findUnique.mockResolvedValue(null);

    const url = await service.checkinUrlByBusinessId('biz-inexistente');

    expect(url).toBeNull();
  });

  it('checkinUrlByBusinessId: arma la URL completa (base + ruta) según experienceVersion', async () => {
    const { service, prisma } = makeHarness();
    process.env.APP_PUBLIC_URL = 'https://app.flikker.com';
    prisma.business.findUnique.mockResolvedValue({
      id: 'biz-1',
      experienceVersion: ExperienceVersion.CHECKIN_V2,
    });

    const url = await service.checkinUrlByBusinessId('biz-1');

    expect(url).toBe('https://app.flikker.com/check-in/tok-principal');
  });

  it('usa una única cadena de fallback de base URL para todos los builders', () => {
    const { service } = makeHarness();
    delete process.env.APP_PUBLIC_URL;
    delete process.env.WEB_BASE_URL;

    expect(service.feedbackUrl('tok')).toBe('https://app.flikker.com/r/tok');
    expect(service.benefitIssuanceUrl('part-1')).toBe(
      'https://app.flikker.com/beneficio/part-1',
    );
    expect(service.redeemUrl('CODE1')).toBe(
      'https://app.flikker.com/redeem/CODE1',
    );
  });
});
