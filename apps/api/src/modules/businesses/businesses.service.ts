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

/**
 * Valid status transitions.
 * ARCHIVED is terminal — no transitions out of it.
 */
const STATUS_TRANSITIONS: Record<BusinessStatus, BusinessStatus[]> = {
  [BusinessStatus.DRAFT]: [BusinessStatus.ACTIVE],
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
  constructor(private readonly repository: BusinessesRepository) {}

  /**
   * Creates a new business and sets the requesting user as OWNER.
   * Slug uniqueness is checked atomically inside the transaction.
   */
  async create(dto: CreateBusinessDto, userId: string) {
    const business = await this.repository.createWithOwner(dto, userId);
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
  async update(businessId: string, dto: UpdateBusinessDto) {
    await this.assertExists(businessId);
    return this.repository.update(businessId, dto);
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

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async assertExists(businessId: string) {
    const exists = await this.repository.findById(businessId);
    if (!exists) throw new NotFoundException('Business not found');
  }
}
