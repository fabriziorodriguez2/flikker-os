import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import type { StringValue } from 'ms';
import { PlatformRepository } from './platform.repository';
import { AuditService } from '../../common/services/audit.service';
import { normalizeToE164 } from '../../common/utils/phone.util';
import { CustomersService } from '../customers/customers.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { WhatsAppBspService } from '../../jobs/whatsapp-bsp.service';
import { GoogleReviewDetectionQueue } from '../../jobs/google-review-detection.queue';

const BCRYPT_ROUNDS = 12;
const BUSINESS_VERTICALS = new Set([
  'dental',
  'estetica',
  'fisio',
  'medico',
  'nutricion',
  'gimnasio',
  'otro',
]);
const BUSINESS_TIMEZONES = new Set([
  'America/Montevideo',
  'America/Buenos_Aires',
  'America/Santiago',
  'America/Sao_Paulo',
  'America/Bogota',
  'America/Lima',
  'America/Mexico_City',
]);

@Injectable()
export class PlatformService {
  private readonly logger = new Logger(PlatformService.name);

  constructor(
    private readonly repository: PlatformRepository,
    private readonly jwt: JwtService,
    private readonly auditService: AuditService,
    private readonly customersService: CustomersService,
    private readonly campaignsService: CampaignsService,
    private readonly whatsAppBspService: WhatsAppBspService,
    private readonly googleReviewDetectionQueue: GoogleReviewDetectionQueue,
  ) {}

  async listBusinesses() {
    const businesses = await this.repository.findAllBusinesses();

    return businesses.map((b) => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      logoUrl: b.logoUrl,
      status: b.status,
      industry: b.industry,
      country: b.country,
      createdAt: b.createdAt,
      plan: b.subscription?.plan?.name ?? 'Free',
      planSlug: b.subscription?.plan?.slug ?? 'free',
      subscriptionStatus: b.subscription?.status ?? null,
      branchCount: b._count.branches,
      memberCount: b._count.memberships,
      customerCount: b._count.customers,
      reviewCount: b._count.googleReviews,
    }));
  }

  async createBusiness(
    adminId: string,
    dto: {
      name?: string;
      legalName?: string;
      vertical?: string;
      country?: string;
      timezone?: string;
      ownerEmail?: string;
      ownerFirstName?: string;
      ownerLastName?: string;
      whatsappPhone?: string;
    },
  ) {
    const name = dto.name?.trim();
    const ownerEmail = dto.ownerEmail?.trim().toLowerCase();
    const ownerFirstName = dto.ownerFirstName?.trim();
    const ownerLastName = dto.ownerLastName?.trim();

    if (!name) throw new BadRequestException('Business name is required');
    if (!ownerEmail) throw new BadRequestException('Owner email is required');
    if (!ownerFirstName) {
      throw new BadRequestException('Owner first name is required');
    }
    if (!ownerLastName) {
      throw new BadRequestException('Owner last name is required');
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);
    const phone = dto.whatsappPhone?.trim()
      ? normalizeToE164(dto.whatsappPhone)
      : undefined;
    const vertical = this.parseVertical(dto.vertical);
    const timezone = this.parseTimezone(dto.timezone);

    const result = await this.repository.createBusinessWithOwner({
      name,
      legalName: dto.legalName?.trim() || undefined,
      vertical,
      country: dto.country?.trim() || 'UY',
      timezone,
      phone,
      ownerEmail,
      ownerFirstName,
      ownerLastName,
      passwordHash,
    });

    this.logPlatformWrite(
      adminId,
      result.business.id,
      'PLATFORM_BUSINESS_CREATED',
      {
        ownerUserId: result.owner.id,
        ownerEmail,
        reusedOwnerUser: result.reusedOwnerUser,
      },
    );

    const loginUrl = `${(
      process.env.APP_PUBLIC_URL ??
      process.env.WEB_BASE_URL ??
      'https://app.flikker.com'
    ).replace(/\/$/, '')}/login`;

    return {
      business: result.business,
      owner: {
        id: result.owner.id,
        email: result.owner.email,
        firstName: result.owner.firstName,
        lastName: result.owner.lastName,
        reusedOwnerUser: result.reusedOwnerUser,
      },
      credentials: {
        loginUrl,
        email: ownerEmail,
        temporaryPassword: result.reusedOwnerUser ? null : temporaryPassword,
        businessName: result.business.name,
      },
    };
  }

  async impersonate(adminId: string, targetBusinessId: string) {
    const business = await this.repository.findBusinessById(targetBusinessId);
    if (!business) throw new NotFoundException('Business not found');

    await this.repository.createImpersonationLog(adminId, targetBusinessId);
    void this.auditService.log({
      action: 'PLATFORM_IMPERSONATION_STARTED',
      entityType: 'Business',
      entityId: targetBusinessId,
      userId: adminId,
      businessId: targetBusinessId,
      metadata: {
        targetBusinessName: business.name,
        targetBusinessSlug: business.slug,
      },
    });

    const token = this.jwt.sign(
      {
        sub: adminId,
        businessId: targetBusinessId,
        isImpersonating: true,
      },
      {
        secret: process.env.JWT_SECRET!,
        expiresIn: (process.env.JWT_IMPERSONATION_EXPIRES_IN ??
          '1h') as StringValue,
      },
    );

    return {
      accessToken: token,
      expiresInSeconds: 60 * 60,
      business,
    };
  }

  async getOnboarding(adminId: string, businessId: string) {
    const business = await this.repository.findOnboardingBusiness(businessId);
    if (!business) throw new NotFoundException('Business not found');

    const campaigns = await this.campaignsService.listForBusiness(
      businessId,
      undefined,
      adminId,
    );
    const customerCount = await this.repository.countCustomers(businessId);

    return {
      business,
      customerCount,
      templates: campaigns
        .filter((campaign) => campaign.templateKind)
        .map((campaign) => ({
          id: campaign.id,
          name: campaign.name,
          templateKind: campaign.templateKind,
          messageBody: campaign.messageBody,
          triggerOffsetDays: campaign.triggerOffsetDays,
          offerText: campaign.offerText,
        })),
    };
  }

  async updateOnboardingBusiness(
    adminId: string,
    businessId: string,
    dto: {
      name?: string;
      vertical?: string;
      timezone?: string;
      whatsappPhone?: string;
      logoUrl?: string | null;
    },
  ) {
    await this.assertBusinessExists(businessId);

    const data: {
      name?: string;
      vertical?: string | null;
      timezone?: string;
      phone?: string | null;
      logoUrl?: string | null;
    } = {};

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('Business name is required');
      data.name = name;
    }
    if (dto.vertical !== undefined) {
      data.vertical = this.parseVertical(dto.vertical);
    }
    if (dto.timezone !== undefined) {
      data.timezone = this.parseTimezone(dto.timezone);
    }
    if (dto.whatsappPhone !== undefined) {
      data.phone = dto.whatsappPhone.trim()
        ? normalizeToE164(dto.whatsappPhone)
        : null;
    }
    if (dto.logoUrl !== undefined) {
      data.logoUrl = dto.logoUrl?.trim() || null;
    }

    const updated = await this.repository.updateOnboardingBusiness(
      businessId,
      data,
    );
    this.logPlatformWrite(adminId, businessId, 'PLATFORM_ONBOARDING_UPDATED', {
      section: 'business',
      data,
    });

    return updated;
  }

  async connectGoogleBusinessProfile(
    adminId: string,
    businessId: string,
    dto: { googlePlaceId?: string; googleReviewUrl?: string },
  ) {
    await this.assertBusinessExists(businessId);

    const googlePlaceId = dto.googlePlaceId?.trim();
    if (!googlePlaceId) {
      throw new BadRequestException('googlePlaceId is required');
    }

    const googleReviewUrl =
      dto.googleReviewUrl?.trim() ?? buildGoogleReviewUrl(googlePlaceId);
    const updated = await this.repository.updateGoogleBusinessProfile(
      businessId,
      {
        googlePlaceId,
        googleBusinessProfileUrl: googleReviewUrl,
        defaultReviewRedirectUrl: googleReviewUrl,
      },
    );

    this.logPlatformWrite(adminId, businessId, 'PLATFORM_GOOGLE_CONNECTED', {
      googlePlaceId,
      googleReviewUrl,
    });

    void this.googleReviewDetectionQueue
      .enqueueInitialScrape(businessId)
      .catch((error) => {
        this.logger.warn(
          `Could not enqueue initial Google review scrape for business ${businessId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });

    return {
      ...updated,
      googleReviewUrl,
    };
  }

  async importOnboardingCustomers(
    adminId: string,
    businessId: string,
    dto: { csv: string },
  ) {
    await this.assertBusinessExists(businessId);
    const result = await this.customersService.importCsv(businessId, {
      csv: dto.csv,
    });

    this.logPlatformWrite(adminId, businessId, 'PLATFORM_CUSTOMERS_IMPORTED', {
      imported: result.imported,
      duplicateCount: result.duplicates,
      errorCount: result.failed.length,
    });

    return {
      ...result,
      created: result.imported,
      errors: result.failed.map((failure) => ({
        row: failure.row,
        message: failure.reason,
      })),
    };
  }

  async updateOnboardingTemplates(
    adminId: string,
    businessId: string,
    dto: {
      templates?: Array<{
        campaignId: string;
        messageBody?: string;
        triggerOffsetDays?: number;
        offerText?: string;
      }>;
    },
  ) {
    await this.assertBusinessExists(businessId);
    const templates = dto.templates ?? [];
    if (!Array.isArray(templates)) {
      throw new BadRequestException('templates must be an array');
    }

    const updated: Awaited<
      ReturnType<CampaignsService['updateRepeatSettings']>
    >[] = [];
    for (const template of templates) {
      if (!template.campaignId) {
        throw new BadRequestException('campaignId is required');
      }
      updated.push(
        await this.campaignsService.updateRepeatSettings(
          businessId,
          template.campaignId,
          {
            messageBody: template.messageBody,
            triggerOffsetDays: template.triggerOffsetDays,
            offerText: template.offerText,
          },
          adminId,
        ),
      );
    }

    this.logPlatformWrite(adminId, businessId, 'PLATFORM_TEMPLATES_UPDATED', {
      count: updated.length,
    });

    return { templates: updated };
  }

  async sendOnboardingTestMessage(
    adminId: string,
    businessId: string,
    dto: { phone?: string; name?: string; customerName?: string },
  ) {
    const business = await this.repository.findOnboardingBusiness(businessId);
    if (!business) throw new NotFoundException('Business not found');
    if (!dto.phone?.trim()) throw new BadRequestException('phone is required');

    const phoneE164 = normalizeToE164(dto.phone);
    const customerName = dto.name?.trim() || dto.customerName?.trim();
    if (!customerName) {
      throw new BadRequestException('name is required');
    }
    const trackingToken = randomBytes(8).toString('base64url');
    const appPublicUrl =
      process.env.APP_PUBLIC_URL ??
      process.env.WEB_BASE_URL ??
      'https://app.flikker.com';
    const trackingUrl = `${appPublicUrl.replace(/\/$/, '')}/r/${trackingToken}`;
    const { customer, message } =
      await this.repository.createOnboardingTestMessage({
        businessId,
        customerName,
        phoneE164,
        trackingToken,
      });

    try {
      const result = await this.whatsAppBspService.sendReviewRequest({
        phone: phoneE164,
        customerName: customer.name,
        trackingUrl,
      });
      await this.repository.markMessageSent(
        message.id,
        result.whatsappMessageId,
      );
      this.logPlatformWrite(adminId, businessId, 'PLATFORM_TEST_MESSAGE_SENT', {
        messageId: message.id,
        customerId: customer.id,
      });

      return {
        ok: true,
        messageId: message.id,
        customerId: customer.id,
        trackingUrl,
      };
    } catch (error) {
      await this.repository.markMessageFailed(message.id);
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Could not send test WhatsApp message',
      );
    }
  }

  async completeOnboarding(adminId: string, businessId: string) {
    await this.assertBusinessExists(businessId);
    const updated = await this.repository.activateBusiness(businessId);
    this.logPlatformWrite(
      adminId,
      businessId,
      'PLATFORM_ONBOARDING_COMPLETED',
      {
        status: updated.status,
      },
    );
    return updated;
  }

  listAuditLogs() {
    return this.repository.findAuditLogs();
  }

  private async assertBusinessExists(businessId: string) {
    const business = await this.repository.findBusinessById(businessId);
    if (!business) throw new NotFoundException('Business not found');
    return business;
  }

  private logPlatformWrite(
    adminId: string,
    businessId: string,
    action: string,
    metadata?: object,
  ) {
    void this.auditService.log({
      action,
      entityType: 'Business',
      entityId: businessId,
      userId: adminId,
      businessId,
      metadata,
    });
  }

  private parseVertical(value?: string) {
    const vertical = value?.trim() || 'otro';
    if (!BUSINESS_VERTICALS.has(vertical)) {
      throw new BadRequestException('Invalid business vertical');
    }
    return vertical;
  }

  private parseTimezone(value?: string) {
    const timezone = value?.trim() || 'America/Montevideo';
    if (!BUSINESS_TIMEZONES.has(timezone)) {
      throw new BadRequestException('Invalid business timezone');
    }
    return timezone;
  }
}

function buildGoogleReviewUrl(placeId: string) {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(
    placeId,
  )}`;
}

function generateTemporaryPassword() {
  return `Flk-${randomBytes(9).toString('base64url')}-1a`;
}
