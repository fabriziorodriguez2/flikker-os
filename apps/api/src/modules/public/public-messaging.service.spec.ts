import {
  PublicMessagingService,
  buildMiFlikkerLink,
} from './public-messaging.service';

function makeDeps() {
  const prisma = {};
  const whatsApp = { sendText: jest.fn().mockResolvedValue(undefined) };
  const reviewRequestQueue = { enqueue: jest.fn() };
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

describe('PublicMessagingService.sendMiFlikkerWelcome', () => {
  it('manda el link real de Mi Flikker por WhatsApp', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.sendMiFlikkerWelcome('+59899123456');

    expect(deps.whatsApp.sendText).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: '+59899123456',
        text: expect.stringContaining(buildMiFlikkerLink()),
      }),
    );
  });

  it('nunca tira, ni siquiera si el envío falla', async () => {
    const deps = makeDeps();
    deps.whatsApp.sendText.mockRejectedValue(new Error('down'));
    const service = makeService(deps);

    await expect(
      service.sendMiFlikkerWelcome('+59899123456'),
    ).resolves.toBeUndefined();
  });
});
