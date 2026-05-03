import { Test, TestingModule } from '@nestjs/testing';
import { MembershipsService } from './memberships.service';
import { MembershipsRepository } from './memberships.repository';
import { PlansService } from '../plans/plans.service';
import {
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { MembershipRole, MembershipStatus } from '@prisma/client';
import { AuditService } from '../../common/services/audit.service';

const BUSINESS_ID = 'biz-1';
const USER_ID = 'user-1';
const ACTOR_ID = 'user-actor';
const MEMBERSHIP_ID = 'mem-1';

const mockUser = {
  id: USER_ID,
  email: 'member@test.com',
  firstName: 'Member',
  lastName: 'User',
};

const mockMembership = {
  id: MEMBERSHIP_ID,
  role: MembershipRole.OWNER,
  status: MembershipStatus.ACTIVE,
  createdAt: new Date(),
  user: mockUser,
};

const mockMembershipFull = {
  id: MEMBERSHIP_ID,
  userId: USER_ID,
  businessId: BUSINESS_ID,
  role: MembershipRole.ADMIN,
  status: MembershipStatus.ACTIVE,
};

const DEFAULT_LIMITS = {
  maxBranches: 1,
  maxMembers: 2,
  maxCampaigns: 1,
  maxReviewsPerMonth: 20,
};

const mockRepo = {
  findManyByBusiness: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
  findByIdInBusiness: jest.fn(),
  findUserByEmail: jest.fn(),
  findExistingMembership: jest.fn(),
  create: jest.fn(),
  reactivate: jest.fn(),
  updateRole: jest.fn(),
  revoke: jest.fn(),
  countActiveOwners: jest.fn(),
  addMemberAtomic: jest.fn(),
  updateRoleAtomicWithOwnerCheck: jest.fn(),
  revokeAtomicWithOwnerCheck: jest.fn(),
};

const mockPlansService = {
  getLimits: jest.fn(),
  assertCanAddMember: jest.fn(),
};

const mockAuditService = {
  log: jest.fn(),
};

describe('MembershipsService', () => {
  let service: MembershipsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPlansService.getLimits.mockResolvedValue(DEFAULT_LIMITS);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MembershipsService,
        { provide: MembershipsRepository, useValue: mockRepo },
        { provide: PlansService, useValue: mockPlansService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<MembershipsService>(MembershipsService);
  });

  // ---------------------------------------------------------------------------
  // listForBusiness
  // ---------------------------------------------------------------------------
  describe('listForBusiness', () => {
    it('returns members scoped to the given businessId', async () => {
      mockRepo.findManyByBusiness.mockResolvedValue([mockMembership]);
      const result = await service.listForBusiness(BUSINESS_ID);
      expect(result).toHaveLength(1);
      expect(mockRepo.findManyByBusiness).toHaveBeenCalledWith(BUSINESS_ID);
    });

    it('returns empty array when business has no members', async () => {
      mockRepo.findManyByBusiness.mockResolvedValue([]);
      const result = await service.listForBusiness(BUSINESS_ID);
      expect(result).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // findOne
  // ---------------------------------------------------------------------------
  describe('findOne', () => {
    it('returns membership when found', async () => {
      mockRepo.findOne.mockResolvedValue(mockMembership);
      const result = await service.findOne(BUSINESS_ID, USER_ID);
      expect(result.id).toBe(MEMBERSHIP_ID);
      expect(mockRepo.findOne).toHaveBeenCalledWith(BUSINESS_ID, USER_ID);
    });

    it('throws NotFoundException when membership does not exist', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne(BUSINESS_ID, 'no-user')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // addMember (atomic)
  // ---------------------------------------------------------------------------
  describe('addMember', () => {
    it('adds a member via atomic repo method', async () => {
      mockRepo.findUserByEmail.mockResolvedValue(mockUser);
      mockRepo.addMemberAtomic.mockResolvedValue({
        ...mockMembership,
        role: MembershipRole.OPERATOR,
      });

      const result = await service.addMember(
        BUSINESS_ID,
        { email: 'member@test.com', role: MembershipRole.OPERATOR },
        MembershipRole.OWNER,
        ACTOR_ID,
      );

      expect(result.role).toBe(MembershipRole.OPERATOR);
      expect(mockRepo.addMemberAtomic).toHaveBeenCalledWith(
        BUSINESS_ID,
        {
          userId: USER_ID,
          role: MembershipRole.OPERATOR,
          invitedByUserId: ACTOR_ID,
        },
        DEFAULT_LIMITS.maxMembers,
      );
    });

    it('throws NotFoundException when user email does not exist', async () => {
      mockRepo.findUserByEmail.mockResolvedValue(null);

      await expect(
        service.addMember(
          BUSINESS_ID,
          { email: 'unknown@test.com', role: MembershipRole.VIEWER },
          MembershipRole.OWNER,
          ACTOR_ID,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when user is already an active member', async () => {
      mockRepo.findUserByEmail.mockResolvedValue(mockUser);
      mockRepo.addMemberAtomic.mockResolvedValue('ALREADY_ACTIVE');

      await expect(
        service.addMember(
          BUSINESS_ID,
          { email: 'member@test.com', role: MembershipRole.OPERATOR },
          MembershipRole.OWNER,
          ACTOR_ID,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ForbiddenException when member limit reached (atomic)', async () => {
      mockRepo.findUserByEmail.mockResolvedValue(mockUser);
      mockRepo.addMemberAtomic.mockResolvedValue('LIMIT_REACHED');

      await expect(
        service.addMember(
          BUSINESS_ID,
          { email: 'member@test.com', role: MembershipRole.OPERATOR },
          MembershipRole.OWNER,
          ACTOR_ID,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('ADMIN cannot assign OWNER role', async () => {
      await expect(
        service.addMember(
          BUSINESS_ID,
          { email: 'member@test.com', role: MembershipRole.OWNER },
          MembershipRole.ADMIN,
          ACTOR_ID,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('ADMIN cannot assign ADMIN role', async () => {
      await expect(
        service.addMember(
          BUSINESS_ID,
          { email: 'member@test.com', role: MembershipRole.ADMIN },
          MembershipRole.ADMIN,
          ACTOR_ID,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('ADMIN can assign OPERATOR role', async () => {
      mockRepo.findUserByEmail.mockResolvedValue(mockUser);
      mockRepo.addMemberAtomic.mockResolvedValue({
        ...mockMembership,
        role: MembershipRole.OPERATOR,
      });

      const result = await service.addMember(
        BUSINESS_ID,
        { email: 'member@test.com', role: MembershipRole.OPERATOR },
        MembershipRole.ADMIN,
        ACTOR_ID,
      );

      expect(result.role).toBe(MembershipRole.OPERATOR);
    });
  });

  // ---------------------------------------------------------------------------
  // updateRole (atomic owner check)
  // ---------------------------------------------------------------------------
  describe('updateRole', () => {
    it('changes role directly when target is not an OWNER', async () => {
      mockRepo.findById.mockResolvedValue(mockMembershipFull);
      mockRepo.updateRole.mockResolvedValue({ count: 1 });
      mockRepo.findByIdInBusiness.mockResolvedValue({
        ...mockMembership,
        role: MembershipRole.OPERATOR,
      });

      const result = await service.updateRole(BUSINESS_ID, MEMBERSHIP_ID, {
        role: MembershipRole.OPERATOR,
      });

      expect(result.role).toBe(MembershipRole.OPERATOR);
      expect(mockRepo.updateRole).toHaveBeenCalledWith(
        BUSINESS_ID,
        MEMBERSHIP_ID,
        MembershipRole.OPERATOR,
      );
    });

    it('throws NotFoundException when membership does not exist', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(
        service.updateRole(BUSINESS_ID, 'missing', {
          role: MembershipRole.VIEWER,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when membership belongs to different business', async () => {
      mockRepo.findById.mockResolvedValue({
        ...mockMembershipFull,
        businessId: 'other-biz',
      });

      await expect(
        service.updateRole(BUSINESS_ID, MEMBERSHIP_ID, {
          role: MembershipRole.VIEWER,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('prevents demoting the last OWNER (atomic)', async () => {
      mockRepo.findById.mockResolvedValue({
        ...mockMembershipFull,
        role: MembershipRole.OWNER,
      });
      mockRepo.updateRoleAtomicWithOwnerCheck.mockResolvedValue('LAST_OWNER');

      await expect(
        service.updateRole(BUSINESS_ID, MEMBERSHIP_ID, {
          role: MembershipRole.ADMIN,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows demoting OWNER when another OWNER exists (atomic)', async () => {
      mockRepo.findById.mockResolvedValue({
        ...mockMembershipFull,
        role: MembershipRole.OWNER,
      });
      mockRepo.updateRoleAtomicWithOwnerCheck.mockResolvedValue({
        ...mockMembership,
        role: MembershipRole.ADMIN,
      });

      const result = await service.updateRole(BUSINESS_ID, MEMBERSHIP_ID, {
        role: MembershipRole.ADMIN,
      });

      expect(result.role).toBe(MembershipRole.ADMIN);
    });
  });

  // ---------------------------------------------------------------------------
  // revoke (atomic owner check)
  // ---------------------------------------------------------------------------
  describe('revoke', () => {
    it('revokes a non-OWNER active membership directly', async () => {
      mockRepo.findById.mockResolvedValue(mockMembershipFull);
      mockRepo.revoke.mockResolvedValue({ count: 1 });
      mockRepo.findByIdInBusiness.mockResolvedValue({
        ...mockMembership,
        status: MembershipStatus.REVOKED,
      });

      const result = await service.revoke(BUSINESS_ID, MEMBERSHIP_ID);
      expect(result.status).toBe(MembershipStatus.REVOKED);
    });

    it('throws NotFoundException when membership does not exist', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.revoke(BUSINESS_ID, 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when membership is already revoked', async () => {
      mockRepo.findById.mockResolvedValue({
        ...mockMembershipFull,
        status: MembershipStatus.REVOKED,
      });

      await expect(service.revoke(BUSINESS_ID, MEMBERSHIP_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('prevents revoking the last OWNER (atomic)', async () => {
      mockRepo.findById.mockResolvedValue({
        ...mockMembershipFull,
        role: MembershipRole.OWNER,
        status: MembershipStatus.ACTIVE,
      });
      mockRepo.revokeAtomicWithOwnerCheck.mockResolvedValue('LAST_OWNER');

      await expect(service.revoke(BUSINESS_ID, MEMBERSHIP_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('allows revoking OWNER when another OWNER exists (atomic)', async () => {
      mockRepo.findById.mockResolvedValue({
        ...mockMembershipFull,
        role: MembershipRole.OWNER,
        status: MembershipStatus.ACTIVE,
      });
      mockRepo.revokeAtomicWithOwnerCheck.mockResolvedValue({
        ...mockMembership,
        role: MembershipRole.OWNER,
        status: MembershipStatus.REVOKED,
      });

      const result = await service.revoke(BUSINESS_ID, MEMBERSHIP_ID);
      expect(result.status).toBe(MembershipStatus.REVOKED);
    });

    it('throws NotFoundException when membership belongs to different business', async () => {
      mockRepo.findById.mockResolvedValue({
        ...mockMembershipFull,
        businessId: 'other-biz',
      });

      await expect(service.revoke(BUSINESS_ID, MEMBERSHIP_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
