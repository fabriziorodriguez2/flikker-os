import { Injectable } from '@nestjs/common';
import { MembershipRole, MembershipStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MembershipsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findManyByBusiness(businessId: string) {
    return this.prisma.membership.findMany({
      where: { businessId, status: MembershipStatus.ACTIVE },
      select: {
        id: true,
        role: true,
        status: true,
        createdAt: true,
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  findOne(businessId: string, userId: string) {
    return this.prisma.membership.findUnique({
      where: { userId_businessId: { userId, businessId } },
      select: {
        id: true,
        role: true,
        status: true,
        createdAt: true,
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });
  }

  findById(id: string) {
    return this.prisma.membership.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        businessId: true,
        role: true,
        status: true,
      },
    });
  }

  findUserByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
  }

  findExistingMembership(businessId: string, userId: string) {
    return this.prisma.membership.findUnique({
      where: { userId_businessId: { userId, businessId } },
      select: { id: true, status: true },
    });
  }

  create(data: {
    userId: string;
    businessId: string;
    role: MembershipRole;
    invitedByUserId: string;
  }) {
    return this.prisma.membership.create({
      data: { ...data, status: MembershipStatus.ACTIVE },
      select: {
        id: true,
        role: true,
        status: true,
        createdAt: true,
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });
  }

  reactivate(id: string, role: MembershipRole) {
    return this.prisma.membership.update({
      where: { id },
      data: { role, status: MembershipStatus.ACTIVE },
      select: {
        id: true,
        role: true,
        status: true,
        createdAt: true,
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });
  }

  updateRole(id: string, role: MembershipRole) {
    return this.prisma.membership.update({
      where: { id },
      data: { role },
      select: {
        id: true,
        role: true,
        status: true,
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });
  }

  revoke(id: string) {
    return this.prisma.membership.update({
      where: { id },
      data: { status: MembershipStatus.REVOKED },
      select: {
        id: true,
        role: true,
        status: true,
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });
  }

  countActiveOwners(businessId: string) {
    return this.prisma.membership.count({
      where: {
        businessId,
        role: MembershipRole.OWNER,
        status: MembershipStatus.ACTIVE,
      },
    });
  }

  private static readonly MEMBER_SELECT = {
    id: true,
    role: true,
    status: true,
    createdAt: true,
    user: {
      select: { id: true, email: true, firstName: true, lastName: true },
    },
  } as const;

  /**
   * Atomically: count active members + check existing + create/reactivate.
   * Returns 'LIMIT_REACHED' | 'ALREADY_ACTIVE' | Membership.
   */
  async addMemberAtomic(
    businessId: string,
    data: {
      userId: string;
      role: MembershipRole;
      invitedByUserId: string;
    },
    maxMembers: number,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const currentCount = await tx.membership.count({
        where: { businessId, status: MembershipStatus.ACTIVE },
      });

      const existing = await tx.membership.findUnique({
        where: {
          userId_businessId: { userId: data.userId, businessId },
        },
        select: { id: true, status: true },
      });

      if (existing && existing.status === MembershipStatus.ACTIVE) {
        return 'ALREADY_ACTIVE' as const;
      }

      // Reactivation doesn't increase count — user was already counted before revoke
      // But new member needs limit check
      if (!existing && currentCount >= maxMembers) {
        return 'LIMIT_REACHED' as const;
      }

      if (existing && existing.status === MembershipStatus.REVOKED) {
        // Reactivation counts as adding, check limit
        if (currentCount >= maxMembers) {
          return 'LIMIT_REACHED' as const;
        }
        return tx.membership.update({
          where: { id: existing.id },
          data: { role: data.role, status: MembershipStatus.ACTIVE },
          select: MembershipsRepository.MEMBER_SELECT,
        });
      }

      return tx.membership.create({
        data: { ...data, businessId, status: MembershipStatus.ACTIVE },
        select: MembershipsRepository.MEMBER_SELECT,
      });
    });
  }

  /**
   * Atomically: count owners + update role (prevents demoting last owner).
   * Returns 'LAST_OWNER' | Membership.
   */
  async updateRoleAtomicWithOwnerCheck(
    businessId: string,
    membershipId: string,
    newRole: MembershipRole,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const ownerCount = await tx.membership.count({
        where: {
          businessId,
          role: MembershipRole.OWNER,
          status: MembershipStatus.ACTIVE,
        },
      });
      if (ownerCount <= 1) return 'LAST_OWNER' as const;

      return tx.membership.update({
        where: { id: membershipId },
        data: { role: newRole },
        select: {
          id: true,
          role: true,
          status: true,
          user: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
      });
    });
  }

  /**
   * Atomically: count owners + revoke membership (prevents revoking last owner).
   * Returns 'LAST_OWNER' | Membership.
   */
  async revokeAtomicWithOwnerCheck(businessId: string, membershipId: string) {
    return this.prisma.$transaction(async (tx) => {
      const ownerCount = await tx.membership.count({
        where: {
          businessId,
          role: MembershipRole.OWNER,
          status: MembershipStatus.ACTIVE,
        },
      });
      if (ownerCount <= 1) return 'LAST_OWNER' as const;

      return tx.membership.update({
        where: { id: membershipId },
        data: { status: MembershipStatus.REVOKED },
        select: {
          id: true,
          role: true,
          status: true,
          user: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
      });
    });
  }
}
