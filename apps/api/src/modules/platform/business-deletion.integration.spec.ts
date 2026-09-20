import { randomUUID } from 'crypto';
import { BusinessStatus, ExperienceVersion } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessDeletionService } from './business-deletion.service';

/**
 * Borrado real contra Postgres real.
 *
 * Un mock acá no probaría nada: lo que se está verificando es justamente que
 * el ORDEN de borrado satisface las 31 FKs `Restrict` de Business y las 10
 * de Customer. Con un mock, cualquier orden "pasa".
 *
 * La aserción que más importa no es que algo se haya borrado, sino que la
 * identidad global HAYA sobrevivido: `FlikkerAccount`, `User`, y los
 * `Customer` de la misma persona en los demás negocios.
 */
describe('BusinessDeletionService (integration)', () => {
  let prisma: PrismaService;
  let service: BusinessDeletionService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new BusinessDeletionService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function makeBusiness(status: BusinessStatus) {
    const b = await prisma.business.create({
      data: {
        name: `Negocio ${status}`,
        slug: `del-${randomUUID()}`,
        country: 'UY',
        timezone: 'America/Montevideo',
        currency: 'UYU',
        experienceVersion: ExperienceVersion.CHECKIN_V2,
        status,
        isActive: status !== BusinessStatus.ARCHIVED,
        archivedAt: status === BusinessStatus.ARCHIVED ? new Date() : null,
      },
      select: { id: true },
    });
    return b.id;
  }

  /** Una persona con identidad global y su Customer en un negocio. */
  async function makePerson(businessId: string, phone: string) {
    const account = await prisma.flikkerAccount.upsert({
      where: { phoneE164: phone },
      update: {},
      create: { phoneE164: phone },
      select: { id: true },
    });
    const customer = await prisma.customer.create({
      data: {
        businessId,
        name: 'Persona',
        phoneE164: phone,
        flikkerAccountId: account.id,
      },
      select: { id: true },
    });
    return { accountId: account.id, customerId: customer.id };
  }

  // ── resetCustomerForBusiness ────────────────────────────────────────

  describe('resetCustomerForBusiness', () => {
    it('borra TODOS los Customer de esa cuenta en el negocio, no solo uno', async () => {
      const businessId = await makeBusiness(BusinessStatus.ACTIVE);
      const otherBusinessId = await makeBusiness(BusinessStatus.ACTIVE);
      const phone = `+5989${Math.floor(1e6 + Math.random() * 9e6)}`;
      try {
        // Tres Customer de la MISMA persona en el mismo negocio — el caso
        // real de Bar Fraternidad (alta manual + dos altas por QR).
        const { accountId } = await makePerson(businessId, phone);
        await prisma.customer.createMany({
          data: [
            {
              businessId,
              name: 'Duplicado 1',
              phoneE164: phone,
              flikkerAccountId: accountId,
            },
            {
              businessId,
              name: 'Duplicado 2',
              phoneE164: phone,
              flikkerAccountId: accountId,
            },
          ],
        });
        // Y uno en OTRO negocio, que no se debe tocar.
        await prisma.customer.create({
          data: {
            businessId: otherBusinessId,
            name: 'En otro lado',
            phoneE164: phone,
            flikkerAccountId: accountId,
          },
        });

        const result = await service.resetCustomerForBusiness({
          businessId,
          flikkerAccountId: accountId,
        });

        expect(result.customerIds).toHaveLength(3);
        expect(result.deleted.Customer).toBe(3);
        expect(result.customersInOtherBusinesses).toBe(1);

        const left = await prisma.customer.count({
          where: { businessId, flikkerAccountId: accountId },
        });
        expect(left).toBe(0);

        // Lo que tiene que sobrevivir.
        expect(result.flikkerAccountPreserved).toBe(true);
        expect(
          await prisma.flikkerAccount.findUnique({ where: { id: accountId } }),
        ).not.toBeNull();
        expect(
          await prisma.customer.count({
            where: { businessId: otherBusinessId, flikkerAccountId: accountId },
          }),
        ).toBe(1);
      } finally {
        await prisma.customer.deleteMany({
          where: { businessId: { in: [businessId, otherBusinessId] } },
        });
        await prisma.flikkerAccount.deleteMany({ where: { phoneE164: phone } });
        await prisma.business.deleteMany({
          where: { id: { in: [businessId, otherBusinessId] } },
        });
      }
    });

    it('arrastra visitas, tarjetas, beneficios y sesiones del cliente', async () => {
      const businessId = await makeBusiness(BusinessStatus.ACTIVE);
      const phone = `+5989${Math.floor(1e6 + Math.random() * 9e6)}`;
      try {
        const { accountId, customerId } = await makePerson(businessId, phone);

        await prisma.visit.createMany({
          data: [
            {
              businessId,
              customerId,
              visitDayKey: '2026-09-01',
              verificationType: 'manual',
            },
            {
              businessId,
              customerId,
              visitDayKey: '2026-09-02',
              verificationType: 'manual',
            },
          ],
        });
        const incentive = await prisma.retentionIncentiveDefinition.create({
          data: {
            businessId,
            name: 'Café',
            type: 'gift',
            active: true,
            rewardGoalEligible: true,
          },
          select: { id: true },
        });
        await prisma.customerRewardGoal.create({
          data: {
            businessId,
            customerId,
            incentiveDefinitionId: incentive.id,
            startingVisitCount: 0,
            targetAdditionalVisits: 6,
            reasonCode: 'NEW_SECOND_VISIT',
            segmentAtCreation: 'NEW',
          },
        });
        await prisma.customerSession.create({
          data: {
            businessId,
            customerId,
            tokenHash: randomUUID(),
            expiresAt: new Date(Date.now() + 86_400_000),
          },
        });

        const result = await service.resetCustomerForBusiness({
          businessId,
          flikkerAccountId: accountId,
        });

        expect(result.deleted.Visit).toBe(2);
        // Tarjeta y sesión son `Cascade`: se van con el Customer, así que no
        // se cuentan por separado — lo que importa es que NO queden.
        expect(
          await prisma.customerRewardGoal.count({ where: { businessId } }),
        ).toBe(0);
        expect(
          await prisma.customerSession.count({ where: { businessId } }),
        ).toBe(0);
        expect(await prisma.visit.count({ where: { businessId } })).toBe(0);
      } finally {
        await prisma.retentionIncentiveDefinition.deleteMany({
          where: { businessId },
        });
        await prisma.customer.deleteMany({ where: { businessId } });
        await prisma.flikkerAccount.deleteMany({ where: { phoneE164: phone } });
        await prisma.business.delete({ where: { id: businessId } });
      }
    });

    it('sin Customers para esa cuenta es un no-op, no un error', async () => {
      const businessId = await makeBusiness(BusinessStatus.ACTIVE);
      const phone = `+5989${Math.floor(1e6 + Math.random() * 9e6)}`;
      try {
        const account = await prisma.flikkerAccount.create({
          data: { phoneE164: phone },
          select: { id: true },
        });
        const result = await service.resetCustomerForBusiness({
          businessId,
          flikkerAccountId: account.id,
        });
        expect(result.customerIds).toEqual([]);
        expect(result.totalDeleted).toBe(0);
        expect(result.flikkerAccountPreserved).toBe(true);
      } finally {
        await prisma.flikkerAccount.deleteMany({ where: { phoneE164: phone } });
        await prisma.business.delete({ where: { id: businessId } });
      }
    });
  });

  // ── hardDeleteBusiness ──────────────────────────────────────────────

  describe('hardDeleteBusiness', () => {
    it('se niega a borrar un negocio ACTIVO', async () => {
      const businessId = await makeBusiness(BusinessStatus.ACTIVE);
      try {
        await expect(service.hardDeleteBusiness(businessId)).rejects.toThrow(
          /archivado/i,
        );
        // Y sigue ahí.
        expect(
          await prisma.business.findUnique({ where: { id: businessId } }),
        ).not.toBeNull();
      } finally {
        await prisma.business.delete({ where: { id: businessId } });
      }
    });

    it('un negocio inexistente da 404, no un borrado silencioso', async () => {
      await expect(service.hardDeleteBusiness(randomUUID())).rejects.toThrow(
        /not found/i,
      );
    });

    it('borra el negocio archivado entero y no deja huérfanos', async () => {
      const businessId = await makeBusiness(BusinessStatus.ARCHIVED);
      const phone = `+5989${Math.floor(1e6 + Math.random() * 9e6)}`;
      const { accountId, customerId } = await makePerson(businessId, phone);

      // Un poco de cada nivel del grafo: Cascade, Restrict, y el ciclo.
      await prisma.visit.create({
        data: {
          businessId,
          customerId,
          visitDayKey: '2026-09-01',
          verificationType: 'manual',
        },
      });
      const benefit = await prisma.benefit.create({
        data: { businessId, title: 'Café', type: 'gift', active: true },
        select: { id: true },
      });
      await prisma.business.update({
        where: { id: businessId },
        data: { welcomeBenefitId: benefit.id },
      });
      await prisma.widget.create({
        data: {
          businessId,
          publicToken: randomUUID(),
          name: 'Widget del negocio',
          type: 'BADGE',
        },
      });
      await prisma.retentionSettings.create({
        data: { businessId, rewardGoalsEnabled: true },
      });

      const result = await service.hardDeleteBusiness(businessId);

      expect(result.deleted.Business).toBe(1);
      expect(
        await prisma.business.findUnique({ where: { id: businessId } }),
      ).toBeNull();

      // Cero huérfanos en las tablas que tocamos.
      for (const count of [
        prisma.customer.count({ where: { businessId } }),
        prisma.visit.count({ where: { businessId } }),
        prisma.benefit.count({ where: { businessId } }),
        prisma.widget.count({ where: { businessId } }),
        prisma.retentionSettings.count({ where: { businessId } }),
      ]) {
        expect(await count).toBe(0);
      }

      // Y la identidad global intacta.
      expect(
        await prisma.flikkerAccount.findUnique({ where: { id: accountId } }),
      ).not.toBeNull();
      expect(result.flikkerAccountsPreserved).toBe(1);

      await prisma.flikkerAccount.deleteMany({ where: { phoneE164: phone } });
    });

    /*
      El caso que motiva todo: el dueño tiene varios negocios. Borrar uno no
      puede dejarlo sin cuenta ni tocar los otros.
    */
    it('el User global y sus otros negocios sobreviven', async () => {
      const doomedId = await makeBusiness(BusinessStatus.ARCHIVED);
      const keptId = await makeBusiness(BusinessStatus.ACTIVE);
      const user = await prisma.user.create({
        data: {
          email: `owner-${randomUUID()}@example.test`,
          passwordHash: 'x',
          firstName: 'Dueño',
          lastName: 'Test',
        },
        select: { id: true },
      });
      try {
        await prisma.membership.createMany({
          data: [
            { userId: user.id, businessId: doomedId, role: 'OWNER' },
            { userId: user.id, businessId: keptId, role: 'OWNER' },
          ],
        });

        const result = await service.hardDeleteBusiness(doomedId);

        expect(result.deleted.Membership).toBe(1);
        expect(result.usersPreserved).toBe(1);
        expect(
          await prisma.user.findUnique({ where: { id: user.id } }),
        ).not.toBeNull();
        expect(
          await prisma.business.findUnique({ where: { id: keptId } }),
        ).not.toBeNull();
        expect(
          await prisma.membership.count({ where: { userId: user.id } }),
        ).toBe(1);
      } finally {
        await prisma.membership.deleteMany({ where: { userId: user.id } });
        await prisma.business.deleteMany({ where: { id: keptId } });
        await prisma.user.delete({ where: { id: user.id } });
      }
    });
  });

  /*
      Regresión de un fallo REAL de producción: los dos negocios con reseñas
      etiquetadas reventaron contra `ReviewTagRelation_tagId_fkey`. Esas
      tablas puente no tienen `businessId`, así que no aparecían en el mapa
      de FKs a Business — solo se llega a ellas navegando desde las reseñas.
    */
  it('borra los nietos de Review que no tienen businessId propio', async () => {
    const businessId = await makeBusiness(BusinessStatus.ARCHIVED);
    try {
      const review = await prisma.review.create({
        data: {
          businessId,
          source: 'GOOGLE',
          status: 'NEW',
          rating: 5,
          authorDisplayName: 'Ana',
          content: 'Excelente',
          reviewedAt: new Date('2026-09-01T00:00:00.000Z'),
        },
        select: { id: true },
      });
      const tag = await prisma.reviewTag.create({
        data: {
          businessId,
          name: 'Atención',
          slug: `atencion-${randomUUID()}`,
        },
        select: { id: true },
      });
      await prisma.reviewTagRelation.create({
        data: { reviewId: review.id, tagId: tag.id },
      });
      await prisma.reviewStatusHistory.create({
        data: { reviewId: review.id, toStatus: 'NEW' },
      });

      const result = await service.hardDeleteBusiness(businessId);

      expect(result.deleted.ReviewTagRelation).toBe(1);
      expect(result.deleted.ReviewStatusHistory).toBe(1);
      expect(
        await prisma.business.findUnique({ where: { id: businessId } }),
      ).toBeNull();
      expect(
        await prisma.reviewTagRelation.count({ where: { tagId: tag.id } }),
      ).toBe(0);
    } catch (e) {
      await prisma.business
        .deleteMany({ where: { id: businessId } })
        .catch(() => undefined);
      throw e;
    }
  });

  // ── purga por lotes ─────────────────────────────────────────────────

  describe('purgeHighVolumeRows', () => {
    it('borra WidgetEvent por lotes y termina en 0', async () => {
      const businessId = await makeBusiness(BusinessStatus.ARCHIVED);
      try {
        await prisma.widgetEvent.createMany({
          data: Array.from({ length: 25 }, () => ({
            businessId,
            eventType: 'impression',
          })),
        });

        const { widgetEvents } = await service.purgeHighVolumeRows(
          businessId,
          10,
        );

        expect(widgetEvents).toBe(25);
        expect(await prisma.widgetEvent.count({ where: { businessId } })).toBe(
          0,
        );
      } finally {
        await prisma.widgetEvent.deleteMany({ where: { businessId } });
        await prisma.business.delete({ where: { id: businessId } });
      }
    });
  });
});
