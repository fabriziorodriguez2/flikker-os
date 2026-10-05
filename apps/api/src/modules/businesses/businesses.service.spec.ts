import { Test, TestingModule } from '@nestjs/testing';
import { BusinessesService } from './businesses.service';
import { BusinessesRepository } from './businesses.repository';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import {
  BusinessStatus,
  MembershipRole,
  MembershipStatus,
  ReviewFlowMode,
} from '@prisma/client';
import { AuditService } from '../../common/services/audit.service';
import { GoogleReviewsProvider } from '../../jobs/google-reviews.provider';
import { GoogleReviewDetectionQueue } from '../../jobs/google-review-detection.queue';
import { WhatsAppBspService } from '../../jobs/whatsapp-bsp.service';
import { GooglePlacesProvider } from '../../jobs/google-places.provider';
import { PlansService } from '../plans/plans.service';
import { CheckoutLeadsService } from '../public/checkout-leads.service';

const OWNER_ID = 'user-owner';
const OTHER_USER_ID = 'user-other';
const BUSINESS_ID = 'biz-1';
const OTHER_BUSINESS_ID = 'biz-2';

const mockBusiness = {
  id: BUSINESS_ID,
  name: 'Test Biz',
  slug: 'test-biz',
  status: BusinessStatus.ACTIVE,
  country: 'UY',
  timezone: 'America/Montevideo',
  currency: 'UYU',
  legalName: null,
  industry: null,
  description: null,
  website: null,
  phone: null,
  email: null,
  logoUrl: null,
  primaryColor: null,
  secondaryColor: null,
  toneOfVoice: null,
  whatsappUrl: null,
  shortBio: null,
  signatureText: null,
  googleBusinessProfileUrl: null,
  defaultReviewRedirectUrl: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  archivedAt: null,
};

const mockBrandProfile = {
  id: BUSINESS_ID,
  name: 'Test Biz',
  logoUrl: null,
  primaryColor: '#FF6B00',
  secondaryColor: '#1A1A1A',
  toneOfVoice: 'friendly',
  whatsappUrl: 'https://wa.me/123',
  website: null,
  shortBio: 'A cool biz',
  signatureText: 'Team Test',
  googleBusinessProfileUrl: null,
  defaultReviewRedirectUrl: null,
};

const mockRepository = {
  createWithOwner: jest.fn(),
  findAllForUser: jest.fn(),
  findMembershipStatus: jest.fn(),
  findById: jest.fn(),
  findBySlug: jest.fn(),
  findBrandProfile: jest.fn(),
  update: jest.fn(),
  updateStatus: jest.fn(),
  findInProgressCheckoutLead: jest.fn(),
  createAuthenticatedCheckoutLead: jest.fn(),
  findRequesterNotificationWhatsapp: jest.fn(),
};

const mockAuditService = {
  log: jest.fn(),
};

// Estas tres dependencias se agregaron al constructor de BusinessesService
// (verificación de reseñas de Google al configurar el negocio, encolar la
// primera detección, y mandar el WhatsApp de bienvenida) después de que este
// archivo se escribiera — el módulo de test nunca las siguió, así que las
// 30 pruebas de este archivo fallaban por DI antes de correr un solo assert.
const mockGoogleReviewsProvider = {
  fetchReviews: jest.fn(),
};
const mockGoogleReviewDetectionQueue = {
  enqueueInitialScrape: jest.fn().mockResolvedValue(undefined),
  enqueueBackfill: jest.fn().mockResolvedValue(undefined),
};
const mockWhatsAppBspService = {
  sendText: jest.fn().mockResolvedValue(undefined),
};
const mockGooglePlacesProvider = {
  isAvailable: jest.fn().mockReturnValue(false),
  searchText: jest.fn().mockResolvedValue([]),
  getDetails: jest.fn().mockResolvedValue(null),
};
const mockPlansService = {
  getSubscriptionOverview: jest.fn().mockResolvedValue({}),
  isOnProPlan: jest.fn().mockResolvedValue(false),
};
// Checkout Pro autenticado (Parte 5) — agregado al constructor de
// BusinessesService después de que este archivo se escribiera, mismo
// motivo que el bloque de arriba.
const mockCheckoutLeadsService = {
  createCheckout: jest.fn(),
};

describe('BusinessesService', () => {
  let service: BusinessesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BusinessesService,
        { provide: BusinessesRepository, useValue: mockRepository },
        { provide: AuditService, useValue: mockAuditService },
        { provide: GoogleReviewsProvider, useValue: mockGoogleReviewsProvider },
        {
          provide: GoogleReviewDetectionQueue,
          useValue: mockGoogleReviewDetectionQueue,
        },
        { provide: WhatsAppBspService, useValue: mockWhatsAppBspService },
        { provide: GooglePlacesProvider, useValue: mockGooglePlacesProvider },
        { provide: PlansService, useValue: mockPlansService },
        { provide: CheckoutLeadsService, useValue: mockCheckoutLeadsService },
      ],
    }).compile();

    service = module.get<BusinessesService>(BusinessesService);
  });

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------
  describe('create', () => {
    it('throws ConflictException if slug already taken', async () => {
      mockRepository.createWithOwner.mockResolvedValue(null);

      await expect(
        service.create(
          {
            name: 'X',
            slug: 'test-biz',
            country: 'UY',
            timezone: 'UTC',
            currency: 'USD',
          },
          OWNER_ID,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('creates business and OWNER membership atomically', async () => {
      mockRepository.createWithOwner.mockResolvedValue(mockBusiness);

      const result = await service.create(
        {
          name: 'Test Biz',
          slug: 'test-biz',
          country: 'UY',
          timezone: 'America/Montevideo',
          currency: 'UYU',
        },
        OWNER_ID,
      );

      expect(result.id).toBe(BUSINESS_ID);
      expect(mockRepository.createWithOwner).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'test-biz' }),
        OWNER_ID,
      );
    });

    it('passes brand fields through to repository', async () => {
      mockRepository.createWithOwner.mockResolvedValue(mockBusiness);

      await service.create(
        {
          name: 'Biz',
          slug: 'biz',
          country: 'UY',
          timezone: 'UTC',
          currency: 'UYU',
          primaryColor: '#FF6B00',
          toneOfVoice: 'friendly',
        },
        OWNER_ID,
      );

      expect(mockRepository.createWithOwner).toHaveBeenCalledWith(
        expect.objectContaining({
          primaryColor: '#FF6B00',
          toneOfVoice: 'friendly',
        }),
        OWNER_ID,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // findAllForUser — core tenancy test
  // ---------------------------------------------------------------------------
  describe('findAllForUser', () => {
    it('returns only businesses where the user has active membership', async () => {
      mockRepository.findAllForUser.mockResolvedValue([
        {
          role: MembershipRole.OWNER,
          business: {
            id: BUSINESS_ID,
            name: 'Test Biz',
            slug: 'test-biz',
            status: BusinessStatus.ACTIVE,
            industry: null,
            country: 'UY',
            logoUrl: null,
            createdAt: new Date(),
          },
        },
      ]);

      const result = await service.findAllForUser(OWNER_ID);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(BUSINESS_ID);
      expect(result[0].role).toBe(MembershipRole.OWNER);
    });

    it('returns empty array when user has no memberships', async () => {
      mockRepository.findAllForUser.mockResolvedValue([]);
      const result = await service.findAllForUser(OTHER_USER_ID);
      expect(result).toHaveLength(0);
    });

    it('calls repository scoped to the requesting user', async () => {
      mockRepository.findAllForUser.mockResolvedValue([]);
      await service.findAllForUser(OWNER_ID);
      expect(mockRepository.findAllForUser).toHaveBeenCalledWith(OWNER_ID);
    });
  });

  // ---------------------------------------------------------------------------
  // findCurrent — tenant context lookup
  // ---------------------------------------------------------------------------
  describe('findCurrent', () => {
    it('returns the business for the given tenant context', async () => {
      mockRepository.findById.mockResolvedValue(mockBusiness);

      const result = await service.findCurrent(BUSINESS_ID);
      expect(result.id).toBe(BUSINESS_ID);
      expect(mockRepository.findById).toHaveBeenCalledWith(BUSINESS_ID);
    });

    it('throws NotFoundException if business does not exist', async () => {
      mockRepository.findById.mockResolvedValue(null);
      await expect(service.findCurrent('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // findOneScoped — tenant isolation
  // ---------------------------------------------------------------------------
  describe('findOneScoped', () => {
    it('throws NotFoundException when user has no membership in the business', async () => {
      mockRepository.findMembershipStatus.mockResolvedValue(null);
      await expect(
        service.findOneScoped(OTHER_BUSINESS_ID, OWNER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when membership is not ACTIVE', async () => {
      mockRepository.findMembershipStatus.mockResolvedValue({
        status: MembershipStatus.REVOKED,
      });
      await expect(
        service.findOneScoped(BUSINESS_ID, OWNER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns business when user has active membership', async () => {
      mockRepository.findMembershipStatus.mockResolvedValue({
        status: MembershipStatus.ACTIVE,
      });
      mockRepository.findById.mockResolvedValue(mockBusiness);

      const result = await service.findOneScoped(BUSINESS_ID, OWNER_ID);
      expect(result.id).toBe(BUSINESS_ID);
    });

    it('always scopes membership lookup by both userId and businessId', async () => {
      mockRepository.findMembershipStatus.mockResolvedValue(null);
      await service.findOneScoped(BUSINESS_ID, OWNER_ID).catch(() => {});

      expect(mockRepository.findMembershipStatus).toHaveBeenCalledWith(
        BUSINESS_ID,
        OWNER_ID,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // getBrandProfile
  // ---------------------------------------------------------------------------
  describe('getBrandProfile', () => {
    it('returns brand profile for existing business', async () => {
      mockRepository.findBrandProfile.mockResolvedValue(mockBrandProfile);

      const result = await service.getBrandProfile(BUSINESS_ID);
      expect(result.primaryColor).toBe('#FF6B00');
      expect(result.toneOfVoice).toBe('friendly');
      expect(mockRepository.findBrandProfile).toHaveBeenCalledWith(BUSINESS_ID);
    });

    it('throws NotFoundException if business does not exist', async () => {
      mockRepository.findBrandProfile.mockResolvedValue(null);
      await expect(service.getBrandProfile('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // updateBrandProfile
  // ---------------------------------------------------------------------------
  describe('updateBrandProfile', () => {
    it('updates brand fields via repository', async () => {
      mockRepository.findById.mockResolvedValue(mockBusiness);
      mockRepository.update.mockResolvedValue({
        ...mockBusiness,
        primaryColor: '#00FF00',
        toneOfVoice: 'professional',
      });

      const result = await service.updateBrandProfile(BUSINESS_ID, {
        primaryColor: '#00FF00',
        toneOfVoice: 'professional',
      });

      expect(result.primaryColor).toBe('#00FF00');
      expect(mockRepository.update).toHaveBeenCalledWith(BUSINESS_ID, {
        primaryColor: '#00FF00',
        toneOfVoice: 'professional',
      });
    });

    it('throws NotFoundException if business does not exist', async () => {
      mockRepository.findById.mockResolvedValue(null);
      await expect(
        service.updateBrandProfile(BUSINESS_ID, {
          primaryColor: '#FF0000',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ---------------------------------------------------------------------------
  // updateStatus — with transition validation
  // ---------------------------------------------------------------------------
  describe('updateStatus', () => {
    it('allows valid transition DRAFT → ACTIVE', async () => {
      mockRepository.findById.mockResolvedValue({
        ...mockBusiness,
        status: BusinessStatus.DRAFT,
      });
      mockRepository.updateStatus.mockResolvedValue({
        ...mockBusiness,
        status: BusinessStatus.ACTIVE,
      });

      await service.updateStatus(BUSINESS_ID, {
        status: BusinessStatus.ACTIVE,
      });

      expect(mockRepository.updateStatus).toHaveBeenCalledWith(
        BUSINESS_ID,
        BusinessStatus.ACTIVE,
      );
    });

    it('allows valid transition ACTIVE → ARCHIVED', async () => {
      mockRepository.findById.mockResolvedValue(mockBusiness);
      mockRepository.updateStatus.mockResolvedValue({
        ...mockBusiness,
        status: BusinessStatus.ARCHIVED,
      });

      await service.updateStatus(BUSINESS_ID, {
        status: BusinessStatus.ARCHIVED,
      });

      expect(mockRepository.updateStatus).toHaveBeenCalledWith(
        BUSINESS_ID,
        BusinessStatus.ARCHIVED,
      );
    });

    it('rejects invalid transition DRAFT → ARCHIVED', async () => {
      mockRepository.findById.mockResolvedValue({
        ...mockBusiness,
        status: BusinessStatus.DRAFT,
      });

      await expect(
        service.updateStatus(BUSINESS_ID, {
          status: BusinessStatus.ARCHIVED,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects any transition from ARCHIVED (terminal state)', async () => {
      mockRepository.findById.mockResolvedValue({
        ...mockBusiness,
        status: BusinessStatus.ARCHIVED,
      });

      await expect(
        service.updateStatus(BUSINESS_ID, {
          status: BusinessStatus.ACTIVE,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects invalid transition DRAFT → SUSPENDED', async () => {
      mockRepository.findById.mockResolvedValue({
        ...mockBusiness,
        status: BusinessStatus.DRAFT,
      });

      await expect(
        service.updateStatus(BUSINESS_ID, {
          status: BusinessStatus.SUSPENDED,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException if business does not exist', async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(
        service.updateStatus(BUSINESS_ID, {
          status: BusinessStatus.INACTIVE,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('Google Places API (New) — Reseñas → Conectar Google', () => {
    it('searchGooglePlaces reporta "no disponible" sin GOOGLE_PLACES_API_KEY, sin llamar a Google', async () => {
      mockGooglePlacesProvider.isAvailable.mockReturnValue(false);

      const result = await service.searchGooglePlaces('Café Uno');

      expect(result).toEqual({ available: false, results: [] });
      expect(mockGooglePlacesProvider.searchText).not.toHaveBeenCalled();
    });

    it('searchGooglePlaces rechaza una consulta vacía', async () => {
      await expect(service.searchGooglePlaces('  ')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('searchGooglePlaces devuelve los resultados de Google cuando está disponible', async () => {
      mockGooglePlacesProvider.isAvailable.mockReturnValue(true);
      mockGooglePlacesProvider.searchText.mockResolvedValue([
        {
          placeId: 'p1',
          displayName: 'Café Uno',
          formattedAddress: 'x',
          rating: 4.5,
          userRatingCount: 10,
        },
      ]);

      const result = await service.searchGooglePlaces('Café Uno');

      expect(result.available).toBe(true);
      expect(result.results).toHaveLength(1);
    });

    it('connectGooglePlace guarda placeId + datos de Google y usa writeAReviewUri real', async () => {
      mockGooglePlacesProvider.getDetails.mockResolvedValue({
        placeId: 'p1',
        displayName: 'Café Uno',
        formattedAddress: 'Av. Siempre Viva 123',
        rating: 4.5,
        userRatingCount: 10,
        writeAReviewUri:
          'https://search.google.com/local/writereview?placeid=p1',
        reviewsUri: 'https://maps.google.com/?cid=p1',
      });
      mockRepository.update.mockResolvedValue({});

      await service.connectGooglePlace(BUSINESS_ID, 'p1');

      expect(mockRepository.update).toHaveBeenCalledWith(
        BUSINESS_ID,
        expect.objectContaining({
          googlePlaceId: 'p1',
          googleBusinessProfileUrl:
            'https://search.google.com/local/writereview?placeid=p1',
          defaultReviewRedirectUrl:
            'https://search.google.com/local/writereview?placeid=p1',
          googlePlaceDisplayName: 'Café Uno',
          googlePlaceRating: 4.5,
          googlePlaceUserRatingCount: 10,
          googlePlaceReviewsUri: 'https://maps.google.com/?cid=p1',
        }),
      );
      // Pedido explícito: al conectar, traer el histórico completo
      // disponible (backfill), no solo la tanda diaria acotada.
      expect(
        mockGoogleReviewDetectionQueue.enqueueBackfill,
      ).toHaveBeenCalledWith(BUSINESS_ID);
    });

    it('connectGooglePlace rechaza si Google no devuelve detalles para ese Place ID', async () => {
      mockGooglePlacesProvider.getDetails.mockResolvedValue(null);

      await expect(
        service.connectGooglePlace(BUSINESS_ID, 'bad-id'),
      ).rejects.toThrow(BadRequestException);
      expect(mockRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('update — reviewFlowMode (Parte 6)', () => {
    it('DIRECT_GOOGLE con defaultReviewRedirectUrl ya guardado: lo acepta', async () => {
      mockRepository.findById.mockResolvedValue({
        id: BUSINESS_ID,
        defaultReviewRedirectUrl: 'https://g.page/r/real',
        googleBusinessProfileUrl: null,
      });
      mockRepository.update.mockResolvedValue({ id: BUSINESS_ID });

      await service.update(BUSINESS_ID, {
        reviewFlowMode: ReviewFlowMode.DIRECT_GOOGLE,
      });

      expect(mockRepository.update).toHaveBeenCalledWith(
        BUSINESS_ID,
        expect.objectContaining({
          reviewFlowMode: ReviewFlowMode.DIRECT_GOOGLE,
        }),
      );
    });

    it('DIRECT_GOOGLE con la URL llegando en el MISMO request: lo acepta', async () => {
      mockRepository.findById.mockResolvedValue({
        id: BUSINESS_ID,
        defaultReviewRedirectUrl: null,
        googleBusinessProfileUrl: null,
      });
      mockRepository.update.mockResolvedValue({ id: BUSINESS_ID });

      await service.update(BUSINESS_ID, {
        reviewFlowMode: ReviewFlowMode.DIRECT_GOOGLE,
        defaultReviewRedirectUrl: 'https://g.page/r/nueva',
      });

      expect(mockRepository.update).toHaveBeenCalled();
    });

    it('DIRECT_GOOGLE sin ninguna URL de Google: rechaza con BadRequestException, nunca guarda', async () => {
      mockRepository.findById.mockResolvedValue({
        id: BUSINESS_ID,
        defaultReviewRedirectUrl: null,
        googleBusinessProfileUrl: null,
      });

      await expect(
        service.update(BUSINESS_ID, {
          reviewFlowMode: ReviewFlowMode.DIRECT_GOOGLE,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockRepository.update).not.toHaveBeenCalled();
    });

    it('PRIVATE_FEEDBACK: nunca exige ninguna URL de Google', async () => {
      mockRepository.findById.mockResolvedValue({
        id: BUSINESS_ID,
        defaultReviewRedirectUrl: null,
        googleBusinessProfileUrl: null,
      });
      mockRepository.update.mockResolvedValue({ id: BUSINESS_ID });

      await service.update(BUSINESS_ID, {
        reviewFlowMode: ReviewFlowMode.PRIVATE_FEEDBACK,
      });

      expect(mockRepository.update).toHaveBeenCalled();
    });

    it('cambiar el modo no borra nada — el repositorio solo pisa los campos del dto', async () => {
      mockRepository.findById.mockResolvedValue({
        id: BUSINESS_ID,
        defaultReviewRedirectUrl: 'https://g.page/r/real',
        googleBusinessProfileUrl: null,
      });
      mockRepository.update.mockResolvedValue({ id: BUSINESS_ID });

      await service.update(BUSINESS_ID, {
        reviewFlowMode: ReviewFlowMode.DIRECT_GOOGLE,
      });

      // Ningún campo de feedback histórico forma parte de este dto — no hay
      // nada acá que pueda estar borrando `CheckinFeedback`/`GoogleReview`.
      expect(mockRepository.update).toHaveBeenCalledWith(BUSINESS_ID, {
        reviewFlowMode: ReviewFlowMode.DIRECT_GOOGLE,
      });
    });
  });

  describe('createProCheckout (Parte 5 — checkout autenticado)', () => {
    const REQUESTER = {
      id: OWNER_ID,
      email: 'owner@ejemplo.com',
      firstName: 'Juan',
      lastName: 'Pérez',
      isActive: true,
      isPlatformAdmin: false,
    };

    beforeEach(() => {
      // Default: el User YA dejó WhatsApp — así los tests de siempre (sin
      // Parte 5F en mente) no se ven afectados. El caso "falta" se prueba
      // aparte, explícito.
      mockRepository.findRequesterNotificationWhatsapp.mockResolvedValue({
        notificationWhatsapp: '+59899123456',
      });
    });

    it('ya Pro: rechaza con ConflictException, nunca llega a crear/buscar un lead', async () => {
      mockPlansService.isOnProPlan.mockResolvedValue(true);

      await expect(
        service.createProCheckout(BUSINESS_ID, REQUESTER, 'MONTHLY' as never),
      ).rejects.toThrow(ConflictException);

      expect(mockRepository.findInProgressCheckoutLead).not.toHaveBeenCalled();
      expect(mockCheckoutLeadsService.createCheckout).not.toHaveBeenCalled();
    });

    it('sin lead en curso: crea uno nuevo (businessId de la sesión, nunca del body) y crea el checkout', async () => {
      mockPlansService.isOnProPlan.mockResolvedValue(false);
      mockRepository.findInProgressCheckoutLead.mockResolvedValue(null);
      mockRepository.createAuthenticatedCheckoutLead.mockResolvedValue({
        id: 'lead-new',
      });
      mockCheckoutLeadsService.createCheckout.mockResolvedValue({
        checkoutUrl: 'https://mp.test/checkout/new',
        status: 'CHECKOUT_CREATED',
      });

      const result = await service.createProCheckout(
        BUSINESS_ID,
        REQUESTER,
        'MONTHLY' as never,
      );

      expect(
        mockRepository.createAuthenticatedCheckoutLead,
      ).toHaveBeenCalledWith({
        businessId: BUSINESS_ID,
        requestedByUserId: REQUESTER.id,
        email: REQUESTER.email,
        plan: 'MONTHLY',
      });
      expect(mockCheckoutLeadsService.createCheckout).toHaveBeenCalledWith(
        'lead-new',
      );
      expect(result).toEqual({
        checkoutUrl: 'https://mp.test/checkout/new',
        status: 'CHECKOUT_CREATED',
      });
    });

    it('con un lead del MISMO negocio y plan ya en curso: lo reusa — nunca crea uno nuevo', async () => {
      mockPlansService.isOnProPlan.mockResolvedValue(false);
      mockRepository.findInProgressCheckoutLead.mockResolvedValue({
        id: 'lead-existing',
      });
      mockCheckoutLeadsService.createCheckout.mockResolvedValue({
        checkoutUrl: 'https://mp.test/checkout/existing',
        status: 'CHECKOUT_CREATED',
      });

      await service.createProCheckout(
        BUSINESS_ID,
        REQUESTER,
        'MONTHLY' as never,
      );

      expect(
        mockRepository.createAuthenticatedCheckoutLead,
      ).not.toHaveBeenCalled();
      expect(mockCheckoutLeadsService.createCheckout).toHaveBeenCalledWith(
        'lead-existing',
      );
    });

    describe('WhatsApp requerido antes del checkout (Parte 5F)', () => {
      it('sin notificationWhatsapp: rechaza con BadRequestException, nunca crea el lead ni llama al provider', async () => {
        mockPlansService.isOnProPlan.mockResolvedValue(false);
        mockRepository.findRequesterNotificationWhatsapp.mockResolvedValue({
          notificationWhatsapp: null,
        });

        await expect(
          service.createProCheckout(BUSINESS_ID, REQUESTER, 'MONTHLY' as never),
        ).rejects.toThrow(BadRequestException);

        expect(
          mockRepository.findInProgressCheckoutLead,
        ).not.toHaveBeenCalled();
        expect(
          mockRepository.createAuthenticatedCheckoutLead,
        ).not.toHaveBeenCalled();
        expect(mockCheckoutLeadsService.createCheckout).not.toHaveBeenCalled();
      });

      it('usuario inexistente (defensivo — no debería pasar con sesión válida): mismo rechazo, nunca crea nada', async () => {
        mockPlansService.isOnProPlan.mockResolvedValue(false);
        mockRepository.findRequesterNotificationWhatsapp.mockResolvedValue(
          null,
        );

        await expect(
          service.createProCheckout(BUSINESS_ID, REQUESTER, 'MONTHLY' as never),
        ).rejects.toThrow(BadRequestException);
        expect(mockCheckoutLeadsService.createCheckout).not.toHaveBeenCalled();
      });

      it('con notificationWhatsapp: el checkout funciona normalmente, igual que siempre', async () => {
        mockPlansService.isOnProPlan.mockResolvedValue(false);
        mockRepository.findRequesterNotificationWhatsapp.mockResolvedValue({
          notificationWhatsapp: '+59899123456',
        });
        mockRepository.findInProgressCheckoutLead.mockResolvedValue(null);
        mockRepository.createAuthenticatedCheckoutLead.mockResolvedValue({
          id: 'lead-new',
        });
        mockCheckoutLeadsService.createCheckout.mockResolvedValue({
          checkoutUrl: 'https://mp.test/checkout/new',
          status: 'CHECKOUT_CREATED',
        });

        const result = await service.createProCheckout(
          BUSINESS_ID,
          REQUESTER,
          'MONTHLY' as never,
        );

        expect(result).toEqual({
          checkoutUrl: 'https://mp.test/checkout/new',
          status: 'CHECKOUT_CREATED',
        });
      });

      it('busca el WhatsApp del requester autenticado — nunca por email ni por un id del body', async () => {
        mockPlansService.isOnProPlan.mockResolvedValue(false);
        mockRepository.findInProgressCheckoutLead.mockResolvedValue({
          id: 'lead-existing',
        });
        mockCheckoutLeadsService.createCheckout.mockResolvedValue({
          checkoutUrl: 'https://mp.test/checkout/existing',
          status: 'CHECKOUT_CREATED',
        });

        await service.createProCheckout(
          BUSINESS_ID,
          REQUESTER,
          'MONTHLY' as never,
        );

        expect(
          mockRepository.findRequesterNotificationWhatsapp,
        ).toHaveBeenCalledWith(REQUESTER.id);
      });
    });
  });
});
