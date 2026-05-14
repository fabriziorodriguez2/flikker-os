import {
  Body,
  Controller,
  Get,
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

@Controller('platform')
@UseGuards(JwtGuard, PlatformAdminGuard)
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

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
    },
  ) {
    return this.platformService.createBusiness(req.user.id, body);
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
}
