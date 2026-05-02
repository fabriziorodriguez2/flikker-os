import { Test, TestingModule } from '@nestjs/testing';
import { BranchesService } from './branches.service';
import { BranchesRepository } from './branches.repository';
import { PlansService } from '../plans/plans.service';
import {
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';

const BUSINESS_ID = 'biz-1';
const BRANCH_ID = 'branch-1';

const DEFAULT_LIMITS = {
  maxBranches: 1,
  maxMembers: 2,
  maxCampaigns: 1,
  maxReviewsPerMonth: 20,
};

const mockBranch = {
  id: BRANCH_ID,
  businessId: BUSINESS_ID,
  name: 'Sucursal Centro',
  slug: 'centro',
  address: 'Av. Principal 123',
  city: 'Montevideo',
  state: 'Montevideo',
  phone: null,
  email: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockRepo = {
  findManyByBusiness: jest.fn(),
  findOne: jest.fn(),
  findBySlugInBusiness: jest.fn(),
  createAtomic: jest.fn(),
  update: jest.fn(),
};

const mockPlansService = {
  getLimits: jest.fn(),
};

describe('BranchesService', () => {
  let service: BranchesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPlansService.getLimits.mockResolvedValue(DEFAULT_LIMITS);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BranchesService,
        { provide: BranchesRepository, useValue: mockRepo },
        { provide: PlansService, useValue: mockPlansService },
      ],
    }).compile();

    service = module.get<BranchesService>(BranchesService);
  });

  // ---------------------------------------------------------------------------
  // listForBusiness
  // ---------------------------------------------------------------------------
  describe('listForBusiness', () => {
    it('returns branches scoped to businessId', async () => {
      mockRepo.findManyByBusiness.mockResolvedValue([mockBranch]);
      const result = await service.listForBusiness(BUSINESS_ID);
      expect(result).toHaveLength(1);
      expect(mockRepo.findManyByBusiness).toHaveBeenCalledWith(
        BUSINESS_ID,
        false,
      );
    });

    it('passes includeInactive flag to repository', async () => {
      mockRepo.findManyByBusiness.mockResolvedValue([]);
      await service.listForBusiness(BUSINESS_ID, true);
      expect(mockRepo.findManyByBusiness).toHaveBeenCalledWith(
        BUSINESS_ID,
        true,
      );
    });

    it('defaults to active-only when includeInactive not specified', async () => {
      mockRepo.findManyByBusiness.mockResolvedValue([]);
      await service.listForBusiness(BUSINESS_ID);
      expect(mockRepo.findManyByBusiness).toHaveBeenCalledWith(
        BUSINESS_ID,
        false,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // findOneScoped
  // ---------------------------------------------------------------------------
  describe('findOneScoped', () => {
    it('returns branch when it belongs to the business', async () => {
      mockRepo.findOne.mockResolvedValue(mockBranch);
      const result = await service.findOneScoped(BUSINESS_ID, BRANCH_ID);
      expect(result.id).toBe(BRANCH_ID);
    });

    it('throws NotFoundException when branch does not belong to business', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(
        service.findOneScoped(BUSINESS_ID, 'other-branch'),
      ).rejects.toThrow(NotFoundException);
    });

    it('scopes lookup by both businessId and branchId', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await service.findOneScoped(BUSINESS_ID, BRANCH_ID).catch(() => {});
      expect(mockRepo.findOne).toHaveBeenCalledWith(BUSINESS_ID, BRANCH_ID);
    });
  });

  // ---------------------------------------------------------------------------
  // create (atomic: limit check + slug check + insert in one transaction)
  // ---------------------------------------------------------------------------
  describe('create', () => {
    it('throws ConflictException when slug already taken (atomic check)', async () => {
      mockRepo.createAtomic.mockResolvedValue('SLUG_TAKEN');
      await expect(
        service.create(BUSINESS_ID, { name: 'Otra', slug: 'centro' }),
      ).rejects.toThrow(ConflictException);
    });

    it('creates branch when slug is available and under limit', async () => {
      mockRepo.createAtomic.mockResolvedValue(mockBranch);
      const result = await service.create(BUSINESS_ID, {
        name: 'Centro',
        slug: 'centro',
      });
      expect(result.id).toBe(BRANCH_ID);
      expect(mockPlansService.getLimits).toHaveBeenCalledWith(BUSINESS_ID);
      expect(mockRepo.createAtomic).toHaveBeenCalledWith(
        BUSINESS_ID,
        { name: 'Centro', slug: 'centro' },
        DEFAULT_LIMITS.maxBranches,
      );
    });

    it('throws ForbiddenException when branch limit reached (atomic)', async () => {
      mockRepo.createAtomic.mockResolvedValue('LIMIT_REACHED');

      await expect(
        service.create(BUSINESS_ID, { name: 'New', slug: 'new' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('passes city and state through to repository', async () => {
      mockRepo.createAtomic.mockResolvedValue(mockBranch);
      await service.create(BUSINESS_ID, {
        name: 'Norte',
        slug: 'norte',
        city: 'Montevideo',
        state: 'Montevideo',
      });
      expect(mockRepo.createAtomic).toHaveBeenCalledWith(
        BUSINESS_ID,
        expect.objectContaining({ city: 'Montevideo', state: 'Montevideo' }),
        DEFAULT_LIMITS.maxBranches,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // update
  // ---------------------------------------------------------------------------
  describe('update', () => {
    it('throws NotFoundException when branch not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(
        service.update(BUSINESS_ID, 'missing', { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates branch when it exists in the business', async () => {
      mockRepo.findOne.mockResolvedValue(mockBranch);
      mockRepo.update.mockResolvedValue({ count: 1 });
      mockRepo.findOne
        .mockResolvedValueOnce(mockBranch)
        .mockResolvedValueOnce({ ...mockBranch, name: 'Nuevo Nombre' });
      const result = await service.update(BUSINESS_ID, BRANCH_ID, {
        name: 'Nuevo Nombre',
      });
      expect(result.name).toBe('Nuevo Nombre');
    });

    it('can deactivate a branch via isActive: false', async () => {
      mockRepo.findOne
        .mockResolvedValueOnce(mockBranch)
        .mockResolvedValueOnce({ ...mockBranch, isActive: false });
      mockRepo.update.mockResolvedValue({ count: 1 });

      const result = await service.update(BUSINESS_ID, BRANCH_ID, {
        isActive: false,
      });
      expect(result.isActive).toBe(false);
      expect(mockRepo.update).toHaveBeenCalledWith(BUSINESS_ID, BRANCH_ID, {
        isActive: false,
      });
    });
  });
});
