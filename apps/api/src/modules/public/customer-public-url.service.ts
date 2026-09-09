import { Injectable } from '@nestjs/common';
import { ExperienceVersion } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { isCheckinV2 } from '../../common/experience/experience.util';
import { VisitSourcesService } from '../visit-sources/visit-sources.service';
import { buildMiFlikkerLink } from './public-messaging.service';

/**
 * Única fuente de verdad para armar URLs customer-facing.
 *
 * Antes de este servicio, cada módulo que necesitaba mandarle un link a un
 * cliente (`/check-in/`, `/qr/`, `/beneficio/`, `/r/`) lo armaba a mano, cada
 * uno con su propia cadena de fallback de base URL — y ninguno sabía que
 * `/check-in/{token}` solo existe para negocios Check-in V2. Acá se decide
 * una sola vez: base URL, `experienceVersion`, y la ruta correcta.
 *
 * `miFlikkerUrl` delega a `buildMiFlikkerLink()` (ya era una fuente de verdad
 * única para ESE link específico) en vez de reimplementarlo — sus llamadores
 * actuales no se migran, esto es aditivo.
 */
@Injectable()
export class CustomerPublicUrlService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visitSources: VisitSourcesService,
  ) {}

  private baseUrl(): string {
    const base =
      process.env.APP_PUBLIC_URL ??
      process.env.WEB_BASE_URL ??
      'https://app.flikker.com';
    return base.replace(/\/$/, '');
  }

  miFlikkerUrl(): string {
    return buildMiFlikkerLink();
  }

  /** El link del recordatorio de reseña / feedback (`/r/{token}`). */
  feedbackUrl(trackingToken: string): string {
    return `${this.baseUrl()}/r/${trackingToken}`;
  }

  /** La pantalla pública de solo lectura de una emisión de Benefit. */
  benefitIssuanceUrl(participationId: string): string {
    return `${this.baseUrl()}/beneficio/${participationId}`;
  }

  /** El canje presencial, staff-only — pero el link en sí es público. */
  redeemUrl(code: string): string {
    return `${this.baseUrl()}/redeem/${code}`;
  }

  /**
   * La ruta (sin base URL) del punto de acceso del negocio — el destino del
   * QR del mostrador. V2 → `/check-in/{token}` de su VisitSource default
   * (se crea si no existe, idempotente — `ensureDefaultSource` nunca duplica
   * bajo carrera). LEGACY → `/qr/{businessId}`, sin tocar VisitSource: no
   * existe para negocios legacy y no debe crearse acá.
   *
   * Recibe el negocio ya resuelto (no vuelve a consultarlo) para que un
   * caller que ya tiene la fila en memoria — como `getQrInfo` — no pague una
   * query extra solo para decidir a dónde mandar al cliente.
   */
  async resolveCheckinPath(business: {
    id: string;
    experienceVersion: ExperienceVersion;
  }): Promise<string> {
    if (isCheckinV2(business)) {
      const source = await this.visitSources.ensureDefaultSource(business.id);
      return `/check-in/${source.token}`;
    }
    return `/qr/${business.id}`;
  }

  /** Igual que `resolveCheckinPath`, con la base URL ya puesta adelante. */
  async resolveCheckinUrl(business: {
    id: string;
    experienceVersion: ExperienceVersion;
  }): Promise<string> {
    return `${this.baseUrl()}${await this.resolveCheckinPath(business)}`;
  }

  /**
   * Igual que `resolveCheckinUrl`, pero a partir de un `businessId` suelto —
   * para callers que todavía no tienen la fila cargada (ej. Promociones).
   * `null` si el negocio no existe.
   */
  async checkinUrlByBusinessId(businessId: string): Promise<string | null> {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, experienceVersion: true },
    });
    if (!business) return null;
    return this.resolveCheckinUrl(business);
  }
}
