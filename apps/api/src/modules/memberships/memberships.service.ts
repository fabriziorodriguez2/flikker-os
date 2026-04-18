import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { MembershipRole, MembershipStatus } from '@prisma/client';
import { MembershipsRepository } from './memberships.repository';
import { PlansService } from '../plans/plans.service';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';

/** Roles that an ADMIN is allowed to assign when adding members. */
const ADMIN_ASSIGNABLE_ROLES: MembershipRole[] = [
  MembershipRole.OPERATOR,
  MembershipRole.VIEWER,
];

@Injectable()
export class MembershipsService {
  constructor(
    private readonly repository: MembershipsRepository,
    private readonly plansService: PlansService,
  ) {}

  listForBusiness(businessId: string) {
    return this.repository.findManyByBusiness(businessId);
  }

  async findOne(businessId: string, userId: string) {
    const membership = await this.repository.findOne(businessId, userId);
    if (!membership) throw new NotFoundException('Membership not found');
    return membership;
  }

  /**
   * Adds a user to the business.
   * - OWNER can assign any role.
   * - ADMIN can only assign OPERATOR or VIEWER.
   * - User must already exist in the system.
   * - User must not already be an active member.
   * - Plan limit check + create happen atomically in one transaction.
   */
  async addMember(
    businessId: string,
    dto: AddMemberDto,
    actorRole: MembershipRole,
    actorUserId: string,
  ) {
    // ADMIN cannot assign OWNER or ADMIN roles
    if (
      actorRole === MembershipRole.ADMIN &&
      !ADMIN_ASSIGNABLE_ROLES.includes(dto.role)
    ) {
      throw new ForbiddenException(
        'Admin can only assign OPERATOR or VIEWER roles',
      );
    }

    const limits = await this.plansService.getLimits(businessId);

    const user = await this.repository.findUserByEmail(dto.email);
    if (!user) throw new NotFoundException('User not found');

    const result = await this.repository.addMemberAtomic(
      businessId,
      {
        userId: user.id,
        role: dto.role,
        invitedByUserId: actorUserId,
      },
      limits.maxMembers,
    );

    if (result === 'LIMIT_REACHED') {
      throw new ForbiddenException(
        `Member limit reached (${limits.maxMembers}). Upgrade your plan.`,
      );
    }
    if (result === 'ALREADY_ACTIVE') {
      throw new ConflictException('User is already a member of this business');
    }
    return result;
  }

  /**
   * Changes the role of a member. OWNER only.
   * Cannot change the last OWNER to a lower role.
   * Owner count check + role change happen atomically.
   */
  async updateRole(
    businessId: string,
    membershipId: string,
    dto: UpdateMemberRoleDto,
  ) {
    const membership = await this.findMembershipInBusiness(
      businessId,
      membershipId,
    );

    const needsOwnerCheck =
      membership.role === MembershipRole.OWNER &&
      dto.role !== MembershipRole.OWNER;

    if (needsOwnerCheck) {
      const result = await this.repository.updateRoleAtomicWithOwnerCheck(
        businessId,
        membershipId,
        dto.role,
      );
      if (result === 'LAST_OWNER') {
        throw new BadRequestException(
          'Cannot remove or demote the last OWNER of the business',
        );
      }
      return result;
    }

    return this.repository.updateRole(membershipId, dto.role);
  }

  /**
   * Revokes a membership. OWNER only.
   * Cannot revoke the last OWNER.
   * Owner count check + revoke happen atomically.
   */
  async revoke(businessId: string, membershipId: string) {
    const membership = await this.findMembershipInBusiness(
      businessId,
      membershipId,
    );

    if (membership.status === MembershipStatus.REVOKED) {
      throw new BadRequestException('Membership is already revoked');
    }

    if (membership.role === MembershipRole.OWNER) {
      const result = await this.repository.revokeAtomicWithOwnerCheck(
        businessId,
        membershipId,
      );
      if (result === 'LAST_OWNER') {
        throw new BadRequestException(
          'Cannot remove or demote the last OWNER of the business',
        );
      }
      return result;
    }

    return this.repository.revoke(membershipId);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async findMembershipInBusiness(
    businessId: string,
    membershipId: string,
  ) {
    const membership = await this.repository.findById(membershipId);
    if (!membership || membership.businessId !== businessId) {
      throw new NotFoundException('Membership not found');
    }
    return membership;
  }
}
