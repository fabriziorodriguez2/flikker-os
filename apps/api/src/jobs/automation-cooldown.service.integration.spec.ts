import { randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { BusinessStatus, ExperienceVersion } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AutomationCooldownService } from './automation-cooldown.service';

/**
 * Política central de dedupe con prioridad determinística — contra DB
 * real, porque lo único que importa de verdad acá es la atomicidad bajo
 * carrera, y eso no se puede probar con un mock de Prisma sin
 * reimplementar la constraint única a mano.
 *
 * El foco de este archivo es que la prioridad (Cumpleaños > Sellos por
 * vencer > Casi llegás > Te extrañamos) se resuelve por REGLA, no por
 * quién llegó primero — un `reserve()` de mayor prioridad tiene que poder
 * robarle el turno a uno de menor prioridad que ya reservó, mientras ese
 * turno todavía no se confirmó (mandó) de verdad.
 */
describe('AutomationCooldownService (integration)', () => {
  let prisma: PrismaService;
  let cooldown: AutomationCooldownService;
  const businesses: string[] = [];

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, AutomationCooldownService],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    cooldown = moduleRef.get(AutomationCooldownService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  afterEach(async () => {
    for (const id of businesses.splice(0)) {
      await prisma.customerAutomationContact.deleteMany({
        where: { businessId: id },
      });
      await prisma.customer.deleteMany({ where: { businessId: id } });
      await prisma.business.delete({ where: { id } }).catch(() => undefined);
    }
  });

  async function makeBusiness() {
    const business = await prisma.business.create({
      data: {
        id: randomUUID(),
        name: 'Café Cooldown',
        slug: `cooldown-${randomUUID().slice(0, 8)}`,
        status: BusinessStatus.ACTIVE,
        country: 'UY',
        currency: 'UYU',
        timezone: 'America/Montevideo',
        experienceVersion: ExperienceVersion.CHECKIN_V2,
      },
    });
    businesses.push(business.id);
    return business.id;
  }

  const makeCustomer = (businessId: string) =>
    prisma.customer
      .create({
        data: {
          id: randomUUID(),
          businessId,
          name: 'Cliente Test',
          phoneE164: `+5989${String(Math.random()).slice(2, 9)}`,
        },
      })
      .then((c) => c.id);

  describe('claimImmediate — Cumpleaños / Sellos por vencer (gracia cero)', () => {
    it('el primer reclamo para un cliente siempre se confirma', async () => {
      const businessId = await makeBusiness();
      const customerId = await makeCustomer(businessId);

      const result = await cooldown.claimImmediate({
        businessId,
        customerId,
        kind: 'birthday',
        now: new Date('2026-08-18T09:00:00.000Z'),
      });

      expect(result).toBe('confirmed');
    });

    it('un segundo reclamo del MISMO kind dentro de 24h queda bloqueado', async () => {
      const businessId = await makeBusiness();
      const customerId = await makeCustomer(businessId);
      const now = new Date('2026-08-18T09:00:00.000Z');

      await cooldown.claimImmediate({
        businessId,
        customerId,
        kind: 'birthday',
        now,
      });
      const second = await cooldown.claimImmediate({
        businessId,
        customerId,
        kind: 'birthday',
        now: new Date(now.getTime() + 60_000),
      });

      expect(second).toBe('blocked');
    });

    it('después de las 24h, el cliente vuelve a estar disponible', async () => {
      const businessId = await makeBusiness();
      const customerId = await makeCustomer(businessId);
      const now = new Date('2026-08-18T09:00:00.000Z');

      await cooldown.claimImmediate({
        businessId,
        customerId,
        kind: 'birthday',
        now,
      });
      const nextDay = await cooldown.claimImmediate({
        businessId,
        customerId,
        kind: 'stamps_expiry',
        now: new Date(now.getTime() + 25 * 3_600_000),
      });

      expect(nextDay).toBe('confirmed');
    });
  });

  describe('prioridad determinística — no depende de quién llega primero', () => {
    it('Retention (reactivación) reserva antes por accidente, pero Cumpleaños llega después y gana', async () => {
      const businessId = await makeBusiness();
      const customerId = await makeCustomer(businessId);
      const now = new Date('2026-08-18T09:00:00.000Z');

      // "Por accidente", el worker de Retention V2 corre primero y reserva.
      const reactivationReserve = await cooldown.reserve({
        businessId,
        customerId,
        kind: 'reactivation',
        now,
      });
      // Cumpleaños llega después (su cron real corre antes, pero acá se
      // simula el accidente de orden explícitamente).
      const birthdayReserve = await cooldown.reserve({
        businessId,
        customerId,
        kind: 'birthday',
        now: new Date(now.getTime() + 60_000),
      });

      expect(reactivationReserve).toBe('reserved');
      expect(birthdayReserve).toBe('reserved'); // le robó el turno

      // Cumpleaños confirma de inmediato (gracia cero) y gana.
      const birthdayConfirm = await cooldown.confirm({
        customerId,
        kind: 'birthday',
        now: new Date(now.getTime() + 60_000),
      });
      expect(birthdayConfirm).toBe('confirmed');

      // Retention, si igual intenta confirmar más tarde, pierde: el turno
      // ya no es suyo.
      const reactivationConfirm = await cooldown.confirm({
        customerId,
        kind: 'reactivation',
        now: new Date(now.getTime() + 15 * 60_000),
      });
      expect(reactivationConfirm).toBe('outranked');
    });

    it('Casi llegás (progreso) vs Te extrañamos (reactivación) — gana Casi llegás aunque reactivación reservó primero', async () => {
      const businessId = await makeBusiness();
      const customerId = await makeCustomer(businessId);
      const now = new Date('2026-08-18T09:00:00.000Z');

      // Te extrañamos (prioridad 4) reserva primero.
      await cooldown.reserve({
        businessId,
        customerId,
        kind: 'reactivation',
        now,
      });
      // Casi llegás (prioridad 3) reserva un minuto después y le roba el turno.
      const progressReserve = await cooldown.reserve({
        businessId,
        customerId,
        kind: 'progress_reminder',
        now: new Date(now.getTime() + 60_000),
      });
      expect(progressReserve).toBe('reserved');

      // Ninguno de los dos puede confirmar antes de que pase el período de
      // gracia (10 min) desde que el turno se abrió (now, no now+60s).
      const tooEarly = await cooldown.confirm({
        customerId,
        kind: 'progress_reminder',
        now: new Date(now.getTime() + 5 * 60_000),
      });
      expect(tooEarly).toBe('not_ready');

      // Pasados los 10 minutos desde la apertura del turno, Casi llegás confirma.
      const progressConfirm = await cooldown.confirm({
        customerId,
        kind: 'progress_reminder',
        now: new Date(now.getTime() + 11 * 60_000),
      });
      expect(progressConfirm).toBe('confirmed');

      // Te extrañamos, si intenta confirmar después, pierde.
      const reactivationConfirm = await cooldown.confirm({
        customerId,
        kind: 'reactivation',
        now: new Date(now.getTime() + 12 * 60_000),
      });
      expect(reactivationConfirm).toBe('outranked');
    });

    it('una automatización de menor prioridad que reserva después de que la de mayor prioridad ya confirmó, queda bloqueada', async () => {
      const businessId = await makeBusiness();
      const customerId = await makeCustomer(businessId);
      const now = new Date('2026-08-18T09:00:00.000Z');

      await cooldown.claimImmediate({
        businessId,
        customerId,
        kind: 'birthday',
        now,
      });

      const stampsReserve = await cooldown.reserve({
        businessId,
        customerId,
        kind: 'stamps_expiry',
        now: new Date(now.getTime() + 10 * 60_000),
      });

      expect(stampsReserve).toBe('blocked');
    });

    it('sin disputa, una automatización de menor prioridad reserva y confirma normalmente tras su período de gracia', async () => {
      const businessId = await makeBusiness();
      const customerId = await makeCustomer(businessId);
      const now = new Date('2026-08-18T09:00:00.000Z');

      const reserved = await cooldown.reserve({
        businessId,
        customerId,
        kind: 'reactivation',
        now,
      });
      expect(reserved).toBe('reserved');

      const confirmed = await cooldown.confirm({
        customerId,
        kind: 'reactivation',
        now: new Date(now.getTime() + 11 * 60_000),
      });
      expect(confirmed).toBe('confirmed');
    });
  });

  describe('skipGraceIfUncontested — confirmar sin esperar cuando no hay nada que le pueda ganar el turno', () => {
    it('con skipGraceIfUncontested, confirma de inmediato aunque el período de gracia normal no haya pasado', async () => {
      const businessId = await makeBusiness();
      const customerId = await makeCustomer(businessId);
      const now = new Date('2026-08-18T09:00:00.000Z');

      await cooldown.reserve({
        businessId,
        customerId,
        kind: 'reactivation',
        now,
      });

      const confirmed = await cooldown.confirm({
        customerId,
        kind: 'reactivation',
        now,
        skipGraceIfUncontested: true,
      });

      expect(confirmed).toBe('confirmed');
    });
  });

  describe('tenancy', () => {
    it('el cooldown de un cliente nunca afecta a un cliente de otro negocio', async () => {
      const businessA = await makeBusiness();
      const businessB = await makeBusiness();
      const customerA = await makeCustomer(businessA);
      const customerB = await makeCustomer(businessB);
      const now = new Date('2026-08-18T09:00:00.000Z');

      await cooldown.claimImmediate({
        businessId: businessA,
        customerId: customerA,
        kind: 'birthday',
        now,
      });
      const claimB = await cooldown.claimImmediate({
        businessId: businessB,
        customerId: customerB,
        kind: 'birthday',
        now,
      });

      expect(claimB).toBe('confirmed');
    });
  });

  describe('concurrencia', () => {
    it('de dos reservas simultáneas para el mismo cliente, exactamente una gana el turno', async () => {
      const businessId = await makeBusiness();
      const customerId = await makeCustomer(businessId);
      const now = new Date('2026-08-18T09:00:00.000Z');

      await Promise.all([
        cooldown.reserve({ businessId, customerId, kind: 'birthday', now }),
        cooldown.reserve({
          businessId,
          customerId,
          kind: 'stamps_expiry',
          now,
        }),
      ]);

      // Nunca dos filas — el `customerId` único es lo que hace esto
      // atómico, no una lectura-y-luego-escritura.
      const rows = await prisma.customerAutomationContact.findMany({
        where: { customerId },
      });
      expect(rows).toHaveLength(1);
      // Cumpleaños (prioridad 1) es quien se queda con el turno sin
      // importar el orden real de ejecución.
      expect(rows[0].kind).toBe('birthday');
    });
  });
});
