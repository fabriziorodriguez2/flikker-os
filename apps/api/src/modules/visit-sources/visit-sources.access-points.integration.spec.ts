import { randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { BusinessStatus, ExperienceVersion } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { VisitSourcesRepository } from './visit-sources.repository';
import { VisitSourcesService } from './visit-sources.service';

/**
 * Garantías de DB en las que se apoya la pantalla "QR y NFC".
 *
 * Los specs con mocks de al lado prueban las reglas; éste prueba que contra
 * Postgres real el acceso principal se repare solo, no se duplique y venga
 * siempre primero — que es lo que hace que la pantalla nunca quede sin QR.
 */
describe('Puntos de acceso — garantías reales (integration)', () => {
  let prisma: PrismaService;
  let service: VisitSourcesService;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, VisitSourcesRepository, VisitSourcesService],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(VisitSourcesService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const created: string[] = [];

  async function makeBusiness(experienceVersion: ExperienceVersion) {
    const business = await prisma.business.create({
      data: {
        id: randomUUID(),
        name: 'Acceso Test',
        slug: `acceso-${randomUUID().slice(0, 8)}`,
        status: BusinessStatus.ACTIVE,
        country: 'UY',
        currency: 'UYU',
        timezone: 'America/Montevideo',
        experienceVersion,
      },
    });
    created.push(business.id);
    return business.id;
  }

  afterEach(async () => {
    for (const id of created.splice(0)) {
      await prisma.visitSource.deleteMany({ where: { businessId: id } });
      await prisma.business.delete({ where: { id } }).catch(() => undefined);
    }
  });

  it('repara el acceso principal de forma idempotente: llamar dos veces deja UNO', async () => {
    const businessId = await makeBusiness(ExperienceVersion.CHECKIN_V2);

    // Estado del que hay que poder salir: el negocio quedó sin principal.
    expect(await prisma.visitSource.count({ where: { businessId } })).toBe(0);

    // Es lo que hace el botón "Generar mi QR": volver a pedir la lista.
    await service.list(businessId);
    await service.list(businessId);

    const defaults = await prisma.visitSource.findMany({
      where: { businessId, isDefault: true },
    });
    expect(defaults).toHaveLength(1);
    expect(defaults[0].name).toBe('Principal');
    expect(defaults[0].isActive).toBe(true);
  });

  it('repara el principal aunque ya existan accesos adicionales', async () => {
    const businessId = await makeBusiness(ExperienceVersion.CHECKIN_V2);
    await service.list(businessId); // crea el principal
    await service.create(businessId, { name: 'Terraza' });

    // Se pierde el principal, pero la Terraza sigue ahí.
    await prisma.visitSource.deleteMany({
      where: { businessId, isDefault: true },
    });

    const list = await service.list(businessId);

    expect(list.filter((s) => s.isDefault)).toHaveLength(1);
    expect(list.some((s) => s.name === 'Terraza')).toBe(true);
  });

  it('el principal viene SIEMPRE primero — es el que muestra la card grande', async () => {
    const businessId = await makeBusiness(ExperienceVersion.CHECKIN_V2);
    await service.list(businessId);
    await service.create(businessId, { name: 'Mesa 1' });
    await service.create(businessId, { name: 'Caja' });

    const list = await service.list(businessId);

    expect(list).toHaveLength(3);
    expect(list[0].isDefault).toBe(true);
    expect(list.slice(1).every((s) => !s.isDefault)).toBe(true);
  });

  it('un acceso adicional apunta al MISMO negocio y no crea programa propio', async () => {
    const businessId = await makeBusiness(ExperienceVersion.CHECKIN_V2);
    await service.list(businessId);
    const extra = await service.create(businessId, { name: 'Terraza' });

    expect(extra.businessId).toBe(businessId);
    expect(extra.isDefault).toBe(false);
    // Tokens distintos, mismo destino conceptual: los dos abren el check-in
    // del mismo negocio, con el mismo programa de sellos.
    expect(service.buildCheckinUrl(extra.token)).toMatch(/\/check-in\//);

    // Crear un punto de acceso no toca la configuración del programa.
    expect(
      await prisma.retentionSettings.count({ where: { businessId } }),
    ).toBe(0);
  });

  it('LEGACY sin regresión: listar NO crea ningún punto de acceso', async () => {
    const businessId = await makeBusiness(ExperienceVersion.LEGACY);

    const list = await service.list(businessId);

    expect(list).toHaveLength(0);
    expect(await prisma.visitSource.count({ where: { businessId } })).toBe(0);
  });

  it('el principal no se puede eliminar; el adicional sí', async () => {
    const businessId = await makeBusiness(ExperienceVersion.CHECKIN_V2);
    const [principal] = await service.list(businessId);
    const extra = await service.create(businessId, { name: 'Terraza' });

    await expect(service.remove(businessId, principal.id)).rejects.toThrow();
    await expect(service.remove(businessId, extra.id)).resolves.toEqual({
      ok: true,
    });

    const remaining = await prisma.visitSource.findMany({
      where: { businessId },
    });
    expect(remaining).toHaveLength(1);
    expect(remaining[0].isDefault).toBe(true);
  });
});
