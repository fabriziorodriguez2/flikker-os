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
import {
  BusinessPlanType,
  BusinessStatus,
  CampaignChannel,
  CampaignStatus,
  CampaignTemplateKind,
  DestinationType,
  ExperienceVersion,
  SubscriptionStatus,
  WidgetMode,
  WidgetPosition,
  WidgetStatus,
  WidgetType,
} from '@prisma/client';
import { SetBusinessPlanDto } from './dto/set-business-plan.dto';
import { PlatformRepository } from './platform.repository';
import { AuditService } from '../../common/services/audit.service';
import { normalizeToE164 } from '../../common/utils/phone.util';
import { parseEmail } from '../../common/utils/email.util';
import { CustomersService } from '../customers/customers.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { WhatsAppBspService } from '../../jobs/whatsapp-bsp.service';
import { GoogleReviewDetectionQueue } from '../../jobs/google-review-detection.queue';
import { PrismaService } from '../../prisma/prisma.service';
import { DEMO_BUSINESS_NAME, DEMO_BUSINESS_SLUG } from '../../config/demo';
import { PlansService } from '../plans/plans.service';

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
    private readonly prisma: PrismaService,
    private readonly plansService: PlansService,
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
      // Rollout flags, so the admin table can show and change them.
      experienceVersion: b.experienceVersion,
      retentionEngineV2Enabled: b.retentionEngineV2Enabled,
    }));
  }

  async getOrCreateDemoBusiness(adminId: string) {
    const business = await this.ensureDemoBusiness(adminId);
    const [customerCount, reviewCount, campaigns, widget] = await Promise.all([
      this.prisma.customer.count({
        where: { businessId: business.id, isActive: true },
      }),
      this.prisma.googleReview.count({ where: { businessId: business.id } }),
      this.prisma.campaign.findMany({
        where: { businessId: business.id },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          templateKind: true,
          _count: { select: { executions: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.widget.findFirst({
        where: {
          businessId: business.id,
          status: WidgetStatus.ACTIVE,
          enabled: true,
        },
        select: {
          id: true,
          mode: true,
          status: true,
          minStars: true,
          maxReviewsShown: true,
          primaryColor: true,
          position: true,
          enabled: true,
        },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    const baseUrl = (
      process.env.APP_PUBLIC_URL ??
      process.env.WEB_BASE_URL ??
      'https://app.flikker.com'
    ).replace(/\/$/, '');

    return {
      business,
      customerCount,
      reviewCount,
      campaigns,
      activeCampaigns: campaigns.filter(
        (campaign) => campaign.status === 'ACTIVE',
      ).length,
      widget,
      isDemo: true,
      widgetLandingUrl: `${baseUrl}/demo/widget-preview`,
      note: 'Negocio demo separado de clientes reales. Los envíos del Test Lab no crean Message ni CampaignExecution.',
    };
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
      initialPlan?: SetBusinessPlanDto;
      /** Admin-only opt-in. Omitted → LEGACY, like every other creation path. */
      experienceVersion?: ExperienceVersion;
    },
  ) {
    const name = dto.name?.trim();
    const ownerFirstName = dto.ownerFirstName?.trim();
    const ownerLastName = dto.ownerLastName?.trim();

    if (!name) throw new BadRequestException('Business name is required');
    if (!dto.ownerEmail?.trim()) {
      throw new BadRequestException('Owner email is required');
    }
    // Validates the format (not just trim/lowercase): this endpoint takes a
    // plain body with no DTO, so without this an owner could be created with a
    // typo'd address like "usuario@gmail" and never be able to log in.
    const ownerEmail = parseEmail(dto.ownerEmail);
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
      // Only this admin flow may opt a brand-new business into Check-in V2.
      // Signup and POST /businesses always fall back to the LEGACY default.
      experienceVersion: dto.experienceVersion ?? ExperienceVersion.LEGACY,
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

    if (dto.initialPlan) {
      try {
        await this.setBusinessPlan(
          result.business.id,
          adminId,
          dto.initialPlan,
        );
      } catch (err) {
        this.logger.warn(
          `Failed to assign initial plan to business ${result.business.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

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

  async archiveBusiness(adminId: string, businessId: string) {
    const business = await this.assertBusinessExists(businessId);
    const archived = await this.repository.archiveBusiness(businessId);

    this.logPlatformWrite(adminId, businessId, 'PLATFORM_BUSINESS_ARCHIVED', {
      businessName: business.name,
      businessSlug: business.slug,
    });

    return archived;
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
        clinicName: business.name,
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

  async triggerReviewSync(adminId: string, businessId: string) {
    const business = await this.assertBusinessExists(businessId);

    void this.googleReviewDetectionQueue
      .enqueueManualScrape(businessId)
      .catch((error) => {
        this.logger.warn(
          `Could not enqueue review sync for business ${businessId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });

    this.logPlatformWrite(
      adminId,
      businessId,
      'PLATFORM_REVIEW_SYNC_TRIGGERED',
      {
        businessName: business.name,
      },
    );

    return { ok: true, businessId };
  }

  /** One-off: import the business's full Google review history (not just newest). */
  async backfillReviews(adminId: string, businessId: string) {
    const business = await this.assertBusinessExists(businessId);

    void this.googleReviewDetectionQueue
      .enqueueBackfill(businessId)
      .catch((error) => {
        this.logger.warn(
          `Could not enqueue review backfill for business ${businessId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });

    this.logPlatformWrite(
      adminId,
      businessId,
      'PLATFORM_REVIEW_BACKFILL_TRIGGERED',
      { businessName: business.name },
    );

    return { ok: true, businessId };
  }

  listAuditLogs() {
    return this.repository.findAuditLogs();
  }

  private async ensureDemoBusiness(adminId: string) {
    const appPublicUrl = (
      process.env.APP_PUBLIC_URL ??
      process.env.WEB_BASE_URL ??
      'https://app.flikker.com'
    ).replace(/\/$/, '');
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.plan.upsert({
        where: { slug: 'pro' },
        update: {
          name: 'Pro',
          description: 'Plan demo para reuniones y pruebas internas.',
          maxBranches: 10,
          maxMembers: 15,
          maxCampaigns: 20,
          maxReviewsPerMonth: 600,
          priceMonthly: 12900,
          priceUsd: 129,
          setupFeeUsd: 99,
          messageQuotaMonthly: 600,
          trialDays: 0,
          displayOrder: 2,
          isActive: true,
        },
        create: {
          slug: 'pro',
          name: 'Pro',
          description: 'Plan demo para reuniones y pruebas internas.',
          maxBranches: 10,
          maxMembers: 15,
          maxCampaigns: 20,
          maxReviewsPerMonth: 600,
          priceMonthly: 12900,
          priceUsd: 129,
          setupFeeUsd: 99,
          messageQuotaMonthly: 600,
          trialDays: 0,
          displayOrder: 2,
          isActive: true,
        },
      });

      const business = await tx.business.upsert({
        where: { slug: DEMO_BUSINESS_SLUG },
        update: {
          name: DEMO_BUSINESS_NAME,
          status: BusinessStatus.ACTIVE,
          isActive: true,
          vertical: 'dental',
          industry: 'Clínica dental',
          timezone: 'America/Montevideo',
          country: 'UY',
          currency: 'USD',
          logoUrl: `${appPublicUrl}/flikker-mark-white.svg`,
          primaryColor: '#5C6BC0',
          defaultReviewRedirectUrl: buildGoogleReviewUrl('demo-flikker'),
          googleBusinessProfileUrl:
            'https://www.google.com/maps/place/?q=place_id:demo-flikker',
          whatsappUrl: 'https://wa.me/59899123456',
          messageQuotaMonthly: 600,
          messageCountCurrentMonth: 0,
        },
        create: {
          name: DEMO_BUSINESS_NAME,
          legalName: 'Flikker Demo',
          slug: DEMO_BUSINESS_SLUG,
          status: BusinessStatus.ACTIVE,
          isActive: true,
          vertical: 'dental',
          industry: 'Clínica dental',
          country: 'UY',
          timezone: 'America/Montevideo',
          currency: 'USD',
          logoUrl: `${appPublicUrl}/flikker-mark-white.svg`,
          primaryColor: '#5C6BC0',
          defaultReviewRedirectUrl: buildGoogleReviewUrl('demo-flikker'),
          googleBusinessProfileUrl:
            'https://www.google.com/maps/place/?q=place_id:demo-flikker',
          whatsappUrl: 'https://wa.me/59899123456',
          messageQuotaMonthly: 600,
          messageCountCurrentMonth: 0,
        },
        select: {
          id: true,
          name: true,
          slug: true,
          logoUrl: true,
          status: true,
          vertical: true,
          timezone: true,
          country: true,
        },
      });

      await tx.subscription.upsert({
        where: { businessId: business.id },
        update: {
          planId: plan.id,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
        create: {
          businessId: business.id,
          planId: plan.id,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      });

      for (const customer of DEMO_CUSTOMERS) {
        const existing = await tx.customer.findFirst({
          where: { businessId: business.id, phoneE164: customer.phoneE164 },
          select: { id: true },
        });

        if (existing) {
          await tx.customer.update({
            where: { id: existing.id },
            data: {
              name: customer.name,
              birthday: customer.birthday,
              isActive: true,
            },
          });
        } else {
          await tx.customer.create({
            data: {
              businessId: business.id,
              name: customer.name,
              phoneE164: customer.phoneE164,
              birthday: customer.birthday,
              isActive: true,
            },
          });
        }
      }

      for (const campaign of DEMO_CAMPAIGNS) {
        await tx.campaign.upsert({
          where: {
            businessId_slug: {
              businessId: business.id,
              slug: campaign.slug,
            },
          },
          update: {
            name: campaign.name,
            description: campaign.description,
            channel: CampaignChannel.WHATSAPP,
            templateKind: campaign.templateKind,
            triggerOffsetDays: campaign.triggerOffsetDays,
            messageBody: campaign.messageBody,
            offerText: campaign.offerText,
            status: CampaignStatus.ACTIVE,
            destinationType: DestinationType.GOOGLE_REVIEW,
            destinationUrl: buildGoogleReviewUrl('demo-flikker'),
            enableLanding: true,
          },
          create: {
            businessId: business.id,
            createdByUserId: adminId,
            name: campaign.name,
            slug: campaign.slug,
            description: campaign.description,
            channel: CampaignChannel.WHATSAPP,
            templateKind: campaign.templateKind,
            triggerOffsetDays: campaign.triggerOffsetDays,
            messageBody: campaign.messageBody,
            offerText: campaign.offerText,
            status: CampaignStatus.ACTIVE,
            destinationType: DestinationType.GOOGLE_REVIEW,
            destinationUrl: buildGoogleReviewUrl('demo-flikker'),
            enableLanding: true,
          },
        });
      }

      for (const review of DEMO_REVIEWS) {
        await tx.googleReview.upsert({
          where: {
            businessId_googleReviewId: {
              businessId: business.id,
              googleReviewId: review.googleReviewId,
            },
          },
          update: {
            reviewerName: review.reviewerName,
            stars: review.stars,
            text: review.text,
            postedAt: review.postedAt,
          },
          create: {
            businessId: business.id,
            googleReviewId: review.googleReviewId,
            reviewerName: review.reviewerName,
            stars: review.stars,
            text: review.text,
            postedAt: review.postedAt,
          },
        });
      }

      for (const mode of [
        WidgetMode.toast,
        WidgetMode.carousel,
        WidgetMode.grid,
      ]) {
        const existingWidget = await tx.widget.findFirst({
          where: { businessId: business.id, mode },
          select: { id: true },
        });
        const widgetData = {
          name:
            mode === WidgetMode.toast
              ? 'Demo Toast'
              : mode === WidgetMode.carousel
                ? 'Demo Carrusel'
                : 'Demo Grid',
          status: WidgetStatus.ACTIVE,
          type: WidgetType.REVIEW_LIST,
          mode,
          position: WidgetPosition.bottom_right,
          title: 'Reseñas de pacientes',
          maxItems: 6,
          minStars: 4,
          maxReviewsShown: 6,
          primaryColor: '#5C6BC0',
          rotationSeconds: 10,
          enabled: true,
          showAuthorName: true,
          showDate: true,
        };

        if (existingWidget) {
          await tx.widget.update({
            where: { id: existingWidget.id },
            data: widgetData,
          });
        } else {
          await tx.widget.create({
            data: {
              businessId: business.id,
              publicToken: randomBytes(16).toString('hex'),
              ...widgetData,
            },
          });
        }
      }

      return business;
    });
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

  // ── Business plans ────────────────────────────────────────────────────────

  async setBusinessPlan(
    businessId: string,
    adminUserId: string,
    dto: SetBusinessPlanDto,
  ) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true },
    });
    if (!business) throw new NotFoundException('Business not found');

    const isTrial = dto.plan === BusinessPlanType.FREE_TRIAL;

    if (isTrial && dto.trialGoal === undefined) {
      throw new BadRequestException('trialGoal is required for FREE_TRIAL');
    }

    const startDate = dto.startDate ? new Date(dto.startDate) : new Date();
    const trialStart = isTrial
      ? dto.trialStart
        ? new Date(dto.trialStart)
        : new Date()
      : null;

    return this.repository.createBusinessPlan({
      businessId,
      plan: dto.plan,
      trialGoal: isTrial ? (dto.trialGoal ?? 25) : null,
      trialStart,
      startDate,
      notes: dto.notes ?? null,
      createdById: adminUserId,
    });
  }

  async getCurrentBusinessPlan(businessId: string) {
    return this.repository.findCurrentBusinessPlan(businessId);
  }

  async listBusinessPlanHistory(businessId: string) {
    return this.repository.findBusinessPlanHistory(businessId);
  }

  // ── Suscripción self-service (Configuración → Suscripción) ────────────────

  /**
   * Confirma manualmente el pago de Pro (Mercado Pago) y activa la
   * Subscription — deliberadamente NO automático. El link de Mercado Pago
   * (`https://mpago.la/1Acxajh`) no tiene webhook integrado todavía, así que
   * un click del dueño no es prueba de pago: solo un admin de plataforma,
   * habiendo confirmado el cobro en el dashboard de Mercado Pago, puede
   * pasar esto a Pro.
   *
   * Usa el plan 'pro-selfservice' (UYU 1.000/mes) — DISTINTO del 'pro'
   * histórico (USD 129/mes) que ya usan negocios reales asignados a mano
   * por Platform Admin. Pisar ese plan global le habría cambiado el precio
   * a Subscriptions que no tienen nada que ver con este flujo; por eso son
   * dos filas separadas (ver `PlansRepository#ensureProSelfServicePlan`).
   * Nunca borra la Subscription anterior: si ya había una Free, se
   * reemplaza por Pro; si no había ninguna, se crea.
   */
  async confirmProSubscription(businessId: string, adminUserId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true },
    });
    if (!business) throw new NotFoundException('Business not found');

    const proPlan = await this.plansService.ensureProSelfServicePlan();

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const subscription = await this.prisma.subscription.upsert({
      where: { businessId },
      update: {
        planId: proPlan.id,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        trialEndsAt: null,
        canceledAt: null,
      },
      create: {
        businessId,
        planId: proPlan.id,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        businessId,
        actorUserId: adminUserId,
        action: 'pro_subscription_confirmed',
        entityType: 'Subscription',
        entityId: subscription.id,
        metadata: { source: 'mercadopago_manual_confirmation' },
      },
    });

    this.logger.log(
      `[platform] Pro subscription confirmed for business ${businessId} by admin ${adminUserId}`,
    );
    return subscription;
  }

  async changeUserPassword(email: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: parseEmail(email) },
      select: { id: true, email: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    // Revoke active sessions alongside the change, same policy as the
    // reset-by-token and self-service flows.
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      }),
      this.prisma.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    this.logger.log(`[platform] Password changed for user ${user.email}`);
    return { ok: true, email: user.email };
  }

  /**
   * Flips a business between the legacy experience and Check-in V2.
   *
   * Fully reversible and non-destructive in both directions: turning V2 off
   * only stops the V2 endpoints and panel from answering — Visits,
   * VisitSources, CustomerSessions and V2 metrics are all kept, so turning it
   * back on restores the business exactly where it left off. Turning V2 on
   * creates nothing up front either: the default VisitSource is still
   * materialized lazily the first time the sources view is opened.
   */
  async setExperience(
    adminId: string,
    businessId: string,
    dto: {
      experienceVersion?: ExperienceVersion;
      retentionEngineV2Enabled?: boolean;
    },
  ) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: {
        id: true,
        name: true,
        experienceVersion: true,
        retentionEngineV2Enabled: true,
      },
    });
    if (!business) throw new NotFoundException('Business not found');

    if (
      dto.experienceVersion === undefined &&
      dto.retentionEngineV2Enabled === undefined
    ) {
      throw new BadRequestException('Nothing to update');
    }

    const updated = await this.prisma.business.update({
      where: { id: businessId },
      data: {
        ...(dto.experienceVersion !== undefined
          ? { experienceVersion: dto.experienceVersion }
          : {}),
        ...(dto.retentionEngineV2Enabled !== undefined
          ? { retentionEngineV2Enabled: dto.retentionEngineV2Enabled }
          : {}),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        experienceVersion: true,
        retentionEngineV2Enabled: true,
      },
    });

    this.logPlatformWrite(adminId, businessId, 'PLATFORM_EXPERIENCE_CHANGED', {
      from: {
        experienceVersion: business.experienceVersion,
        retentionEngineV2Enabled: business.retentionEngineV2Enabled,
      },
      to: {
        experienceVersion: updated.experienceVersion,
        retentionEngineV2Enabled: updated.retentionEngineV2Enabled,
      },
    });

    return updated;
  }

  async resetOnboardingForBusiness(adminId: string, businessId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true },
    });
    if (!business) throw new NotFoundException('Business not found');

    const result =
      await this.repository.resetOnboardingForBusinessOwners(businessId);

    this.logPlatformWrite(adminId, businessId, 'PLATFORM_ONBOARDING_RESET', {
      resetCount: result.resetCount,
    });

    return result;
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

const DEMO_CUSTOMERS = [
  {
    name: 'Camila Fernández',
    phoneE164: '+59899123111',
    birthday: new Date('1991-04-12T12:00:00.000Z'),
  },
  {
    name: 'Diego Pereira',
    phoneE164: '+59898234222',
    birthday: new Date('1988-08-22T12:00:00.000Z'),
  },
  {
    name: 'Sofía Bentancur',
    phoneE164: '+59899345333',
    birthday: new Date('1995-11-03T12:00:00.000Z'),
  },
  {
    name: 'Martín Suárez',
    phoneE164: '+59898456444',
    birthday: null,
  },
  {
    name: 'Valentina Ríos',
    phoneE164: '+59899567555',
    birthday: new Date('1992-01-30T12:00:00.000Z'),
  },
  {
    name: 'Federico Lamas',
    phoneE164: '+59898678666',
    birthday: null,
  },
  {
    name: 'Agustina Vázquez',
    phoneE164: '+59899789777',
    birthday: new Date('1986-06-18T12:00:00.000Z'),
  },
  {
    name: 'Nicolás Bidegain',
    phoneE164: '+59898890888',
    birthday: new Date('1990-09-09T12:00:00.000Z'),
  },
];

const DEMO_CAMPAIGNS = [
  {
    name: 'Repeat: post-servicio',
    slug: 'repeat-post-servicio-demo',
    description: 'Mensaje automático luego de la atención.',
    templateKind: CampaignTemplateKind.post_service,
    triggerOffsetDays: 0,
    messageBody:
      'Hola {nombre}, gracias por venir a {clinica}. Nos ayuda mucho saber cómo fue tu experiencia: {link_resena} ❤️',
    offerText: null,
  },
  {
    name: 'Repeat: reactivación',
    slug: 'repeat-reactivacion-demo',
    description: 'Para pacientes que no vinieron en más de 6 meses.',
    templateKind: CampaignTemplateKind.reactivation,
    triggerOffsetDays: 180,
    messageBody:
      'Hola {nombre}, te extrañamos en {clinica}. Si querés volver esta semana, tenemos esta propuesta para vos: {oferta}',
    offerText: '10% de descuento en limpieza dental',
  },
  {
    name: 'Repeat: cumpleaños',
    slug: 'repeat-cumpleanos-demo',
    description: 'Saludo automático para pacientes con fecha de nacimiento.',
    templateKind: CampaignTemplateKind.birthday,
    triggerOffsetDays: 0,
    messageBody:
      '¡Feliz cumpleaños, {nombre}! De parte de {clinica}, te mandamos un abrazo grande y este beneficio: {oferta}',
    offerText: 'consulta de control sin costo durante tu mes',
  },
];

const DEMO_REVIEWS = [
  {
    googleReviewId: 'demo-review-01',
    reviewerName: 'Aleli Rocha',
    stars: 5,
    text: 'Excelente atención y muy buena explicación del tratamiento.',
    postedAt: daysAgoDate(9),
  },
  {
    googleReviewId: 'demo-review-02',
    reviewerName: 'Mariana P.',
    stars: 5,
    text: 'Me sentí muy cómoda. El equipo fue puntual y amable.',
    postedAt: daysAgoDate(16),
  },
  {
    googleReviewId: 'demo-review-03',
    reviewerName: 'Joaquín R.',
    stars: 4,
    text: 'Muy buena experiencia, agenda simple y trato claro.',
    postedAt: daysAgoDate(24),
  },
  {
    googleReviewId: 'demo-review-04',
    reviewerName: 'Lucía M.',
    stars: 5,
    text: 'La doctora fue muy cuidadosa. Recomiendo la clínica.',
    postedAt: daysAgoDate(32),
  },
  {
    googleReviewId: 'demo-review-05',
    reviewerName: 'Martín Silva',
    stars: 5,
    text: 'Servicio impecable y el recordatorio por WhatsApp me ayudó mucho.',
    postedAt: daysAgoDate(41),
  },
  {
    googleReviewId: 'demo-review-06',
    reviewerName: 'Camila Fernández',
    stars: 4,
    text: 'Muy conforme con la limpieza y la atención del equipo.',
    postedAt: daysAgoDate(52),
  },
  {
    googleReviewId: 'demo-review-07',
    reviewerName: 'Federico L.',
    stars: 5,
    text: 'Rápidos, claros y con buena disponibilidad.',
    postedAt: daysAgoDate(66),
  },
  {
    googleReviewId: 'demo-review-08',
    reviewerName: 'Sofía B.',
    stars: 5,
    text: 'Me explicaron todo antes de empezar. Muy recomendable.',
    postedAt: daysAgoDate(78),
  },
];

function daysAgoDate(days: number) {
  return new Date(Date.now() - days * 86_400_000);
}
