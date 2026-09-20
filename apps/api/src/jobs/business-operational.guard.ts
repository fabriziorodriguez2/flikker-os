import { BusinessStatus } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * "¿Este negocio puede todavía producir efectos hacia afuera?"
 *
 * Un solo lugar define qué significa operativamente vivo, porque el criterio
 * está repartido en tres campos que se escriben juntos pero se podrían leer
 * por separado — `PlatformRepository.archiveBusiness` setea los tres a la vez:
 *
 *     status = ARCHIVED   ·   isActive = false   ·   archivedAt = now()
 *
 * Chequear solo uno alcanzaría hoy, y por eso los chequeos sueltos que ya
 * existen (`isActive: true`) no están mal. Pero un negocio que quede en un
 * estado intermedio por una migración, un fix manual en la base o un camino
 * futuro que toque un campo y no los otros, volvería a mandar mensajes. Los
 * tres juntos no se pueden desincronizar.
 *
 * Y "no existe" cuenta como no operativo: los jobs de BullMQ llevan el
 * businessId serializado y sobreviven al negocio, así que un worker puede
 * despertarse con el id de algo que ya se borró.
 *
 * SKIP limpio, nunca excepción: un negocio archivado no es un error del job.
 * Tirar acá haría que BullMQ reintente para siempre un trabajo que jamás va
 * a poder completarse.
 */

/** Forma mínima que hay que leer para decidir. */
export interface OperationalBusinessFields {
  isActive: boolean;
  archivedAt: Date | null;
  status: BusinessStatus;
}

/**
 * Filtro Prisma reutilizable, para cortar el trabajo en la query misma en vez
 * de traer filas que después se descartan. Se usa anidado
 * (`where: { business: OPERATIONAL_BUSINESS_WHERE }`) en los barridos.
 */
export const OPERATIONAL_BUSINESS_WHERE = {
  isActive: true,
  archivedAt: null,
  status: { not: BusinessStatus.ARCHIVED },
} as const;

/** Campos que hay que traer para poder llamar a `isBusinessOperational`. */
export const OPERATIONAL_BUSINESS_SELECT = {
  isActive: true,
  archivedAt: true,
  status: true,
} as const;

/**
 * Chequeo en memoria, para cuando el negocio ya vino cargado con el registro
 * que el worker está procesando (`include: { business: true }`) y volver a
 * consultarlo sería un round-trip de más.
 */
export function isBusinessOperational(
  business: OperationalBusinessFields | null | undefined,
): boolean {
  if (!business) return false;
  return (
    business.isActive === true &&
    business.archivedAt === null &&
    business.status !== BusinessStatus.ARCHIVED
  );
}

/**
 * Chequeo contra la base, para cuando el worker solo tiene un `businessId`
 * (típicamente el payload de un job encolado hace rato). Un negocio borrado
 * devuelve `null` y por lo tanto `false`.
 */
export async function loadOperationalBusiness(
  prisma: PrismaService,
  businessId: string,
): Promise<boolean> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: OPERATIONAL_BUSINESS_SELECT,
  });
  return isBusinessOperational(business);
}
