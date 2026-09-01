import { BenefitType } from '@prisma/client';
import {
  PublicMessagingService,
  buildMiFlikkerLink,
} from './public-messaging.service';

function makeDeps() {
  const prisma = {
    message: {
      create: jest.fn().mockResolvedValue({ id: 'message-1' }),
    },
  };
  const whatsApp = { sendText: jest.fn().mockResolvedValue(undefined) };
  const reviewRequestQueue = {
    enqueue: jest.fn().mockResolvedValue(undefined),
  };
  return { prisma, whatsApp, reviewRequestQueue };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new PublicMessagingService(
    deps.prisma as never,
    deps.whatsApp as never,
    deps.reviewRequestQueue as never,
  );
}

describe('buildMiFlikkerLink', () => {
  const ORIGINAL_APP_PUBLIC_URL = process.env.APP_PUBLIC_URL;
  const ORIGINAL_WEB_BASE_URL = process.env.WEB_BASE_URL;

  afterEach(() => {
    process.env.APP_PUBLIC_URL = ORIGINAL_APP_PUBLIC_URL;
    process.env.WEB_BASE_URL = ORIGINAL_WEB_BASE_URL;
  });

  it('usa APP_PUBLIC_URL cuando está configurado, sin doble slash', () => {
    process.env.APP_PUBLIC_URL = 'https://flikker.site/';
    expect(buildMiFlikkerLink()).toBe('https://flikker.site/mi');
  });

  it('cae a WEB_BASE_URL si no hay APP_PUBLIC_URL', () => {
    delete process.env.APP_PUBLIC_URL;
    process.env.WEB_BASE_URL = 'https://app.flikker.com';
    expect(buildMiFlikkerLink()).toBe('https://app.flikker.com/mi');
  });

  it('usa el default si no hay ninguna env var', () => {
    delete process.env.APP_PUBLIC_URL;
    delete process.env.WEB_BASE_URL;
    expect(buildMiFlikkerLink()).toBe('https://app.flikker.com/mi');
  });
});

/**
 * Reemplaza a los tests de `sendMiFlikkerWelcome`, que ya no existe: era el
 * segundo WhatsApp del registro y competía con éste por la ventana de 5
 * segundos del proveedor. El link ahora viaja DENTRO de este mensaje.
 */
describe('PublicMessagingService.sendWelcome — un solo mensaje, con el link adentro', () => {
  it('incluye el link de Mi Flikker en el MISMO texto cuando se le pasa', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    const ok = await service.sendWelcome(
      '+59899123456',
      'David',
      'Bar Fraternidad',
      null,
      null,
      buildMiFlikkerLink(),
    );

    expect(ok).toBe(true);
    expect(deps.whatsApp.sendText).toHaveBeenCalledTimes(1);
    const [{ text }] = deps.whatsApp.sendText.mock.calls[0];
    expect(text).toContain('David');
    expect(text).toContain('Bar Fraternidad');
    expect(text).toContain(buildMiFlikkerLink());
    expect(text).toContain('/mi');
  });

  it('sin link (LEGACY /qr) el texto queda como siempre, sin mencionar Mi Flikker', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.sendWelcome(
      '+59899123456',
      'David',
      'Bar Fraternidad',
      null,
      null,
    );

    const [{ text }] = deps.whatsApp.sendText.mock.calls[0];
    expect(text).not.toContain('/mi');
    expect(text).not.toContain('Flikker');
  });

  it('el link también viaja cuando hay beneficio — sigue siendo UN mensaje', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.sendWelcome(
      '+59899123456',
      'David',
      'Bar Fraternidad',
      '10% de descuento',
      BenefitType.discount,
      buildMiFlikkerLink(),
    );

    expect(deps.whatsApp.sendText).toHaveBeenCalledTimes(1);
    const [{ text }] = deps.whatsApp.sendText.mock.calls[0];
    expect(text).toContain('10% de descuento');
    expect(text).toContain(buildMiFlikkerLink());
  });

  it('nunca tira si el envío falla, pero DEVUELVE false para que el caller no lo dé por enviado', async () => {
    const deps = makeDeps();
    deps.whatsApp.sendText.mockRejectedValue(new Error('down'));
    const service = makeService(deps);

    await expect(
      service.sendWelcome(
        '+59899123456',
        'David',
        'Bar Fraternidad',
        null,
        null,
        buildMiFlikkerLink(),
      ),
    ).resolves.toBe(false);
  });
});

describe('enqueueReviewRequest', () => {
  it('guarda la visita que originó el recordatorio', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.enqueueReviewRequest('biz-1', 'cust-1', null, 'visit-1');

    expect(deps.prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ originatingVisitId: 'visit-1' }),
      }),
    );
  });

  it('sin visita conocida no inventa una', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.enqueueReviewRequest('biz-1', 'cust-1', null);

    const data = deps.prisma.message.create.mock.calls[0][0].data as {
      originatingVisitId?: string;
    };
    expect(data.originatingVisitId).toBeUndefined();
  });
});
