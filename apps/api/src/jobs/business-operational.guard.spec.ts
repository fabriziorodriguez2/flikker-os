import { BusinessStatus } from '@prisma/client';
import {
  isBusinessOperational,
  loadOperationalBusiness,
  OPERATIONAL_BUSINESS_WHERE,
} from './business-operational.guard';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * El criterio único de "este negocio todavía puede producir efectos hacia
 * afuera". Archivar escribe tres campos a la vez; estos tests fijan que
 * CUALQUIERA de los tres, solo, alcanza para cortar — así un estado
 * intermedio (una migración, un fix manual, un camino futuro que toque uno
 * y no los otros) nunca vuelve a habilitar envíos.
 */
describe('business-operational.guard', () => {
  const live = {
    isActive: true,
    archivedAt: null,
    status: BusinessStatus.ACTIVE,
  };

  describe('isBusinessOperational', () => {
    it('un negocio vivo pasa', () => {
      expect(isBusinessOperational(live)).toBe(true);
    });

    it('ONBOARDING y DRAFT también pasan — no están archivados', () => {
      expect(
        isBusinessOperational({ ...live, status: BusinessStatus.ONBOARDING }),
      ).toBe(true);
      expect(
        isBusinessOperational({ ...live, status: BusinessStatus.DRAFT }),
      ).toBe(true);
    });

    it('status ARCHIVED corta, aunque los otros dos digan que está vivo', () => {
      expect(
        isBusinessOperational({ ...live, status: BusinessStatus.ARCHIVED }),
      ).toBe(false);
    });

    it('isActive false corta por sí solo', () => {
      expect(isBusinessOperational({ ...live, isActive: false })).toBe(false);
    });

    it('archivedAt seteado corta por sí solo', () => {
      expect(isBusinessOperational({ ...live, archivedAt: new Date() })).toBe(
        false,
      );
    });

    /*
      El caso de los jobs viejos: BullMQ guarda el businessId serializado y
      el job sobrevive al negocio. Un negocio borrado llega como null.
    */
    it('un negocio inexistente (null/undefined) no es operativo', () => {
      expect(isBusinessOperational(null)).toBe(false);
      expect(isBusinessOperational(undefined)).toBe(false);
    });
  });

  describe('loadOperationalBusiness', () => {
    const makePrisma = (row: unknown) =>
      ({
        business: { findUnique: jest.fn().mockResolvedValue(row) },
      }) as unknown as PrismaService;

    it('consulta por id y devuelve true para un negocio vivo', async () => {
      const prisma = makePrisma(live);
      expect(await loadOperationalBusiness(prisma, 'biz-1')).toBe(true);
    });

    it('devuelve false para un negocio archivado', async () => {
      const prisma = makePrisma({
        isActive: false,
        archivedAt: new Date(),
        status: BusinessStatus.ARCHIVED,
      });
      expect(await loadOperationalBusiness(prisma, 'biz-1')).toBe(false);
    });

    it('devuelve false —sin tirar— si el negocio ya no existe', async () => {
      const prisma = makePrisma(null);
      await expect(loadOperationalBusiness(prisma, 'borrado')).resolves.toBe(
        false,
      );
    });
  });

  describe('OPERATIONAL_BUSINESS_WHERE', () => {
    it('exige las tres condiciones, no una sola', () => {
      expect(OPERATIONAL_BUSINESS_WHERE).toEqual({
        isActive: true,
        archivedAt: null,
        status: { not: BusinessStatus.ARCHIVED },
      });
    });
  });
});
