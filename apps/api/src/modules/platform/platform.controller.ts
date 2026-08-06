import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import type { AuthenticatedRequest } from '../../common/types/request.types';
import { PlatformService } from './platform.service';
import { ShopifyConfigService } from '../integrations/shopify/shopify-config.service';
import { SetBusinessPlanDto } from './dto/set-business-plan.dto';
import { UpdateExperienceDto } from './dto/update-experience.dto';
import { ExperienceVersion } from '@prisma/client';

@Controller('platform')
@UseGuards(JwtGuard, PlatformAdminGuard)
export class PlatformController {
  constructor(
    private readonly platformService: PlatformService,
    private readonly shopifyConfigService: ShopifyConfigService,
  ) {}

  /**
   * Lists all businesses with stats — platform admins only.
   * Cross-tenant: no x-business-id needed.
   */
  @Get('businesses')
  listBusinesses() {
    return this.platformService.listBusinesses();
  }

  @Post('businesses')
  createBusiness(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
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
      /**
       * Admin-only. Omitted → LEGACY. This is the only creation path allowed to
       * start a business on Check-in V2; public signup and POST /businesses
       * always use the LEGACY default.
       */
      experienceVersion?: ExperienceVersion;
    },
  ) {
    return this.platformService.createBusiness(req.user.id, body);
  }

  /**
   * Switches a business between the legacy experience and Check-in V2, and
   * persists the (not yet implemented) retention-engine flag. Reversible and
   * non-destructive: no V2 data is deleted when turning it off.
   */
  @Patch('businesses/:businessId/experience')
  setExperience(
    @Req() req: AuthenticatedRequest,
    @Param('businessId') businessId: string,
    @Body() dto: UpdateExperienceDto,
  ) {
    return this.platformService.setExperience(req.user.id, businessId, dto);
  }

  @Delete('businesses/:businessId')
  deleteBusiness(
    @Req() req: AuthenticatedRequest,
    @Param('businessId') businessId: string,
  ) {
    return this.platformService.archiveBusiness(req.user.id, businessId);
  }

  @Get('businesses/:businessId/onboarding')
  getOnboarding(
    @Req() req: AuthenticatedRequest,
    @Param('businessId') businessId: string,
  ) {
    return this.platformService.getOnboarding(req.user.id, businessId);
  }

  @Patch('businesses/:businessId/onboarding/business')
  updateOnboardingBusiness(
    @Req() req: AuthenticatedRequest,
    @Param('businessId') businessId: string,
    @Body()
    body: {
      name?: string;
      vertical?: string;
      timezone?: string;
      whatsappPhone?: string;
      logoUrl?: string | null;
    },
  ) {
    return this.platformService.updateOnboardingBusiness(
      req.user.id,
      businessId,
      body,
    );
  }

  @Patch('businesses/:businessId/onboarding/google')
  connectGoogleBusinessProfile(
    @Req() req: AuthenticatedRequest,
    @Param('businessId') businessId: string,
    @Body() body: { googlePlaceId?: string; googleReviewUrl?: string },
  ) {
    return this.platformService.connectGoogleBusinessProfile(
      req.user.id,
      businessId,
      body,
    );
  }

  @Post('businesses/:businessId/onboarding/import-customers')
  importOnboardingCustomers(
    @Req() req: AuthenticatedRequest,
    @Param('businessId') businessId: string,
    @Body() body: { csv: string },
  ) {
    return this.platformService.importOnboardingCustomers(
      req.user.id,
      businessId,
      body,
    );
  }

  @Patch('businesses/:businessId/onboarding/templates')
  updateOnboardingTemplates(
    @Req() req: AuthenticatedRequest,
    @Param('businessId') businessId: string,
    @Body()
    body: {
      templates?: Array<{
        campaignId: string;
        messageBody?: string;
        triggerOffsetDays?: number;
        offerText?: string;
      }>;
    },
  ) {
    return this.platformService.updateOnboardingTemplates(
      req.user.id,
      businessId,
      body,
    );
  }

  @Post('businesses/:businessId/onboarding/test-message')
  sendOnboardingTestMessage(
    @Req() req: AuthenticatedRequest,
    @Param('businessId') businessId: string,
    @Body() body: { phone?: string; name?: string; customerName?: string },
  ) {
    return this.platformService.sendOnboardingTestMessage(
      req.user.id,
      businessId,
      body,
    );
  }

  @Post('businesses/:businessId/onboarding/complete')
  completeOnboarding(
    @Req() req: AuthenticatedRequest,
    @Param('businessId') businessId: string,
  ) {
    return this.platformService.completeOnboarding(req.user.id, businessId);
  }

  @Get('audit-logs')
  listAuditLogs() {
    return this.platformService.listAuditLogs();
  }

  @Get('test-lab/demo')
  getTestLabDemo(@Req() req: AuthenticatedRequest) {
    return this.platformService.getOrCreateDemoBusiness(req.user.id);
  }

  @Post('businesses/:businessId/sync-reviews')
  triggerReviewSync(
    @Req() req: AuthenticatedRequest,
    @Param('businessId') businessId: string,
  ) {
    return this.platformService.triggerReviewSync(req.user.id, businessId);
  }

  @Post('businesses/:businessId/backfill-reviews')
  backfillReviews(
    @Req() req: AuthenticatedRequest,
    @Param('businessId') businessId: string,
  ) {
    return this.platformService.backfillReviews(req.user.id, businessId);
  }

  @Post('businesses/:businessId/impersonate')
  impersonate(
    @Req() req: AuthenticatedRequest,
    @Param('businessId') businessId: string,
  ) {
    return this.platformService.impersonate(req.user.id, businessId);
  }

  @Post('exit-impersonation')
  exitImpersonation() {
    return { ok: true };
  }

  @Post('users/change-password')
  @HttpCode(200)
  changeUserPassword(@Body() body: { email?: string; newPassword?: string }) {
    if (!body.email?.trim()) {
      throw new BadRequestException('email is required');
    }
    if (!body.newPassword || body.newPassword.length < 8) {
      throw new BadRequestException(
        'La contraseña debe tener al menos 8 caracteres',
      );
    }
    return this.platformService.changeUserPassword(
      body.email,
      body.newPassword,
    );
  }

  // ── Platform-scoped Shopify integration management ─────────────────────────

  @Get('businesses/:businessId/integrations/shopify')
  getShopifyIntegration(@Param('businessId') businessId: string) {
    return this.shopifyConfigService.getIntegration(businessId);
  }

  @Post('businesses/:businessId/integrations/shopify')
  upsertShopifyIntegration(
    @Param('businessId') businessId: string,
    @Body() body: { shopDomain: string; webhookSecret?: string },
  ) {
    return this.shopifyConfigService.upsertIntegration(businessId, body);
  }

  @Delete('businesses/:businessId/integrations/shopify')
  deleteShopifyIntegration(@Param('businessId') businessId: string) {
    return this.shopifyConfigService.deleteIntegration(businessId);
  }

  @Get('businesses/:businessId/integrations/shopify/orders')
  getShopifyOrders(@Param('businessId') businessId: string) {
    return this.shopifyConfigService.getRecentOrders(businessId);
  }

  // ── Business plans ─────────────────────────────────────────────────────────

  @Post('businesses/:businessId/plans')
  setBusinessPlan(
    @Req() req: AuthenticatedRequest,
    @Param('businessId') businessId: string,
    @Body() dto: SetBusinessPlanDto,
  ) {
    return this.platformService.setBusinessPlan(businessId, req.user.id, dto);
  }

  @Get('businesses/:businessId/plans/current')
  getCurrentBusinessPlan(@Param('businessId') businessId: string) {
    return this.platformService.getCurrentBusinessPlan(businessId);
  }

  @Get('businesses/:businessId/plans')
  listBusinessPlanHistory(@Param('businessId') businessId: string) {
    return this.platformService.listBusinessPlanHistory(businessId);
  }

  @Post('businesses/:businessId/reset-onboarding')
  resetOnboarding(
    @Req() req: AuthenticatedRequest,
    @Param('businessId') businessId: string,
  ) {
    return this.platformService.resetOnboardingForBusiness(
      req.user.id,
      businessId,
    );
  }
}
