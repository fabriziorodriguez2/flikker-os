import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { BusinessStatus, MembershipStatus } from '@prisma/client';
import { BusinessesRepository } from './businesses.repository';
import { CreateBusinessDto } from './dto/create-business.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { UpdateBusinessStatusDto } from './dto/update-business-status.dto';
import { UpdateBrandProfileDto } from './dto/update-brand-profile.dto';
import { AuditService } from '../../common/services/audit.service';
import { normalizeToE164 } from '../../common/utils/phone.util';
import { GoogleReviewsProvider } from '../../jobs/google-reviews.provider';
import { GoogleReviewDetectionQueue } from '../../jobs/google-review-detection.queue';
import { WhatsAppBspService } from '../../jobs/whatsapp-bsp.service';
import { GooglePlacesProvider } from '../../jobs/google-places.provider';
import { PlansService } from '../plans/plans.service';

/**
 * Valid status transitions.
 * ARCHIVED is terminal — no transitions out of it.
 */
const STATUS_TRANSITIONS: Record<BusinessStatus, BusinessStatus[]> = {
  [BusinessStatus.DRAFT]: [BusinessStatus.ONBOARDING, BusinessStatus.ACTIVE],
  [BusinessStatus.ONBOARDING]: [
    BusinessStatus.ACTIVE,
    BusinessStatus.INACTIVE,
    BusinessStatus.ARCHIVED,
  ],
  [BusinessStatus.ACTIVE]: [
    BusinessStatus.INACTIVE,
    BusinessStatus.SUSPENDED,
    BusinessStatus.ARCHIVED,
  ],
  [BusinessStatus.INACTIVE]: [BusinessStatus.ACTIVE, BusinessStatus.ARCHIVED],
  [BusinessStatus.SUSPENDED]: [BusinessStatus.ACTIVE, BusinessStatus.ARCHIVED],
  [BusinessStatus.ARCHIVED]: [],
};

@Injectable()
export class BusinessesService {
  constructor(
    private readonly repository: BusinessesRepository,
    private readonly auditService: AuditService,
    private readonly googleReviewsProvider: GoogleReviewsProvider,
    private readonly googleReviewDetectionQueue: GoogleReviewDetectionQueue,
    private readonly whatsAppBspService: WhatsAppBspService,
    private readonly googlePlacesProvider: GooglePlacesProvider,
    private readonly plans: PlansService,
  ) {}

  /** Configuración → Suscripción — todo lo que la pantalla necesita, ya resuelto. */
  getSubscriptionOverview(businessId: string) {
    return this.plans.getSubscriptionOverview(businessId);
  }

  /**
   * Google Places API (New) — búsqueda por nombre para "Reseñas → Conectar
   * Google". Nunca lanza si la API key no está configurada: devuelve lista
   * vacía (el controller/frontend ya sabe mostrar "no disponible" — mismo
   * criterio que el resto del repo para integraciones opcionales).
   */
  async searchGooglePlaces(query?: string) {
    const trimmed = query?.trim();
    if (!trimmed) {
      throw new BadRequestException('Ingresá el nombre de tu negocio');
    }
    const available = this.googlePlacesProvider.isAvailable();
    const results = available
      ? await this.googlePlacesProvider.searchText(trimmed)
      : [];
    return { available, results };
  }

  /**
   * Conecta el Place elegido: guarda placeId + datos de solo lectura de
   * Google (nombre, dirección, rating, links de Maps) y dispara el MISMO
   * scrape inicial que ya usaba `verifyGooglePlace` — no se duplica el
   * pipeline de reseñas, solo se reemplaza cómo se obtiene/verifica el
   * Place ID (antes: pegado a mano + Scrape.do como "verificación"; ahora:
   * Places API real).
   *
   * `googleBusinessProfileUrl`/`defaultReviewRedirectUrl` se pisan con el
   * `writeAReviewUri` REAL de Google en vez del link armado a mano — mismos
   * campos de siempre, dato más confiable.
   */
  async connectGooglePlace(businessId: string, placeId: string) {
    const details = await this.googlePlacesProvider.getDetails(placeId);
    if (!details) {
      throw new BadRequestException(
        'No pudimos conectar ese negocio con Google',
      );
    }

    const reviewUrl = details.writeAReviewUri ?? buildGoogleReviewUrl(placeId);

    await this.repository.update(businessId, {
      googlePlaceId: details.placeId,
      googleBusinessProfileUrl: reviewUrl,
      defaultReviewRedirectUrl: reviewUrl,
      googleReviewsLastSyncAt: null,
      googlePlaceDisplayName: details.displayName,
      googlePlaceFormattedAddress: details.formattedAddress,
      googlePlaceRating: details.rating,
      googlePlaceUserRatingCount: details.userRatingCount,
      googlePlaceReviewsUri: details.reviewsUri,
      // Ancla de "reseñas desde que usás Flikker" — se pisa en cada
      // reconexión, siempre habla del Place conectado ahora.
      googlePlaceConnectedAt: new Date(),
    });

    // Pedido explícito: al conectar, traer el histórico DISPONIBLE completo
    // (no solo las ~60 reseñas más nuevas de `enqueueInitialScrape`) — así
    // "Reseñas totales en Google" puede mostrar el total real desde el
    // primer momento, y queda conservado para analytics. Mismo mecanismo
    // que ya usaba el backfill manual de Platform Admin, sin duplicar
    // lógica de scraping.
    void this.googleReviewDetectionQueue
      .enqueueBackfill(businessId)
      .catch(() => undefined);

    return {
      placeId: details.placeId,
      displayName: details.displayName,
      formattedAddress: details.formattedAddress,
      rating: details.rating,
      userRatingCount: details.userRatingCount,
      reviewsUri: details.reviewsUri,
    };
  }

  /**
   * Creates a new business and sets the requesting user as OWNER.
   * Slug uniqueness is checked atomically inside the transaction.
   */
  async create(dto: CreateBusinessDto, userId: string) {
    const payload = {
      ...dto,
      slug: dto.slug ?? slugify(dto.name),
      country: dto.country ?? 'UY',
      currency: dto.currency ?? 'USD',
      industry: dto.industry ?? dto.vertical,
    };
    const business = await this.repository.createWithOwner(payload, userId);
    if (!business) throw new ConflictException('Slug already taken');
    return business;
  }

  /**
   * Lists only businesses where the user has an active membership.
   * Core tenancy rule: a user never sees businesses they don't belong to.
   */
  async findAllForUser(userId: string) {
    const memberships = await this.repository.findAllForUser(userId);
    return memberships.map((m) => ({ ...m.business, role: m.role }));
  }

  /**
   * Returns the business from the current tenant context.
   * TenantGuard already validated membership — we just fetch the data.
   */
  async findCurrent(businessId: string) {
    const business = await this.repository.findById(businessId);
    if (!business) throw new NotFoundException('Business not found');
    return business;
  }

  /**
   * Returns a single business — only if the user has active membership in it.
   */
  async findOneScoped(businessId: string, userId: string) {
    const membership = await this.repository.findMembershipStatus(
      businessId,
      userId,
    );

    if (!membership || membership.status !== MembershipStatus.ACTIVE) {
      throw new NotFoundException('Business not found');
    }

    const business = await this.repository.findById(businessId);
    if (!business) throw new NotFoundException('Business not found');

    return business;
  }

  /**
   * Updates a business. Caller must have been authorized by TenantGuard + RolesGuard.
   * businessId is the trusted value from req.currentBusinessId.
   */
  async update(
    businessId: string,
    dto: UpdateBusinessDto,
    actorUserId?: string,
  ) {
    const before = await this.repository.findById(businessId);
    if (!before) throw new NotFoundException('Business not found');

    const updated = await this.repository.update(businessId, dto);

    if (actorUserId) {
      void this.auditService.log({
        action: 'BUSINESS_SETTINGS_UPDATED',
        entityType: 'Business',
        entityId: businessId,
        userId: actorUserId,
        businessId,
        metadata: {
          before: this.pickBusinessUpdateFields(before, dto),
          after: this.pickBusinessUpdateFields(updated, dto),
        },
      });
    }

    return updated;
  }

  /**
   * Changes business status with transition validation.
   * Restricted to OWNER only (enforced at controller level).
   */
  async updateStatus(businessId: string, dto: UpdateBusinessStatusDto) {
    const business = await this.repository.findById(businessId);
    if (!business) throw new NotFoundException('Business not found');

    const allowed = STATUS_TRANSITIONS[business.status];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot transition from ${business.status} to ${dto.status}`,
      );
    }

    return this.repository.updateStatus(businessId, dto.status);
  }

  /**
   * Returns only the brand profile fields for the current business.
   */
  async getBrandProfile(businessId: string) {
    const brand = await this.repository.findBrandProfile(businessId);
    if (!brand) throw new NotFoundException('Business not found');
    return brand;
  }

  /**
   * Updates only brand profile fields.
   * Restricted to OWNER/ADMIN (enforced at controller level).
   */
  async updateBrandProfile(businessId: string, dto: UpdateBrandProfileDto) {
    await this.assertExists(businessId);
    return this.repository.update(businessId, dto);
  }

  async verifyGooglePlace(
    businessId: string,
    userId: string,
    placeId?: string,
  ) {
    const business = await this.findOneScoped(businessId, userId);
    const googlePlaceId = placeId?.trim();
    if (!googlePlaceId) {
      throw new BadRequestException('Google Place ID is required');
    }

    try {
      const reviews = await this.googleReviewsProvider.fetchReviews({
        businessId,
        googlePlaceId,
        googleRefreshToken: business.googleRefreshToken,
      });
      const rating =
        reviews.length > 0
          ? Number(
              (
                reviews.reduce((total, review) => total + review.stars, 0) /
                reviews.length
              ).toFixed(1),
            )
          : null;
      const googleReviewUrl = buildGoogleReviewUrl(googlePlaceId);

      await this.repository.update(businessId, {
        googlePlaceId,
        googleBusinessProfileUrl: googleReviewUrl,
        defaultReviewRedirectUrl: googleReviewUrl,
        googleReviewsLastSyncAt: null,
      });

      // Mismo criterio que `connectGooglePlace`: al conectar/verificar, traer
      // el histórico disponible completo, no solo la tanda diaria acotada.
      void this.googleReviewDetectionQueue
        .enqueueBackfill(businessId)
        .catch(() => undefined);

      return {
        name: business.name,
        rating,
        reviewCount: reviews.length,
      };
    } catch {
      throw new BadRequestException('No encontramos ese negocio');
    }
  }

  async verifyWhatsApp(businessId: string, userId: string, phone?: string) {
    const business = await this.findOneScoped(businessId, userId);
    if (!phone?.trim()) throw new BadRequestException('phone is required');

    const phoneE164 = normalizeToE164(phone);
    await this.whatsAppBspService.sendText({
      phone: phoneE164,
      text: `Flikker conectado con ${business.name}. Ya podés enviar pedidos de reseña desde este número.`,
    });
    await this.repository.update(businessId, { phone: phoneE164 });

    return { connected: true };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async assertExists(businessId: string) {
    const exists = await this.repository.findById(businessId);
    if (!exists) throw new NotFoundException('Business not found');
  }

  private pickBusinessUpdateFields(
    business: Awaited<ReturnType<BusinessesRepository['findById']>>,
    dto: UpdateBusinessDto,
  ) {
    if (!business) return {};
    return Object.keys(dto).reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = business[key as keyof typeof business];
      return acc;
    }, {});
  }
}

function slugify(value: string) {
  const slug = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'negocio';
}

function buildGoogleReviewUrl(placeId: string) {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(
    placeId,
  )}`;
}
