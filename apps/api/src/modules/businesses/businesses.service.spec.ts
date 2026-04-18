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
} from '@prisma/client';

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
};

describe('BusinessesService', () => {
  let service: BusinessesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BusinessesService,
        { provide: BusinessesRepository, useValue: mockRepository },
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
});
