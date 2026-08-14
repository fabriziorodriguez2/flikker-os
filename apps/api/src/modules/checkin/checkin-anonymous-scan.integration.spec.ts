import { randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import {
  BusinessStatus,
  ExperienceVersion,
  VisitSourceType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CheckinModule } from './checkin.module';
import { CheckinService } from './checkin.service';

/**
 * /dashboard/customers rediseñado (pedido explícito): "un scan anónimo NO es
 * todavía un cliente". Esto prueba la mitad que no se ve desde Clientes — el
 * lado del check-in: abrir el QR sin identificarse (`resolveLanding`) nunca
 * crea un `Customer`, sin importar cuántas veces se escanee. Recién
 * `register()` (nombre + teléfono) crea la fila — y eso ya lo cubren los
 * tests de `checkin.service.spec.ts`.
 */
describe('Check-in — un scan anónimo nunca crea un cliente (integration)', () => {
  let prisma: PrismaService;
  let checkin: CheckinService;
  let businessId: string;
  let token: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
        CheckinModule,
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService, { strict: false });
    checkin = moduleRef.get(CheckinService, { strict: false });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    const business = await prisma.business.create({
      data: {
        id: randomUUID(),
        name: 'Café Anónimo',
        slug: `anon-${randomUUID().slice(0, 8)}`,
        status: BusinessStatus.ACTIVE,
        country: 'UY',
        currency: 'UYU',
        timezone: 'America/Montevideo',
        experienceVersion: ExperienceVersion.CHECKIN_V2,
      },
    });
    businessId = business.id;
    token = randomUUID();
    await prisma.visitSource.create({
      data: {
        businessId,
        name: 'Principal',
        type: VisitSourceType.qr,
        isDefault: true,
        token,
      },
    });
  });

  afterEach(async () => {
    await prisma.message
      .deleteMany({ where: { businessId } })
      .catch(() => undefined);
    await prisma.customerEvent.deleteMany({ where: { businessId } });
    await prisma.visit.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.visitSource.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
  });

  it('resolveLanding (abrir el QR sin identificarse) no crea ningún Customer', async () => {
    await checkin.resolveLanding(token);
    await checkin.resolveLanding(token);
    await checkin.resolveLanding(token);

    const count = await prisma.customer.count({ where: { businessId } });
    expect(count).toBe(0);
  });

  it('register (nombre + teléfono) sí crea al cliente — la única puerta de entrada', async () => {
    await checkin.resolveLanding(token); // escaneos previos, sin identificarse
    const phone = `+59891${String(Date.now()).slice(-6)}`;

    await checkin.register(token, { name: 'Cliente Real', phone });

    const count = await prisma.customer.count({ where: { businessId } });
    expect(count).toBe(1);
  });
});
