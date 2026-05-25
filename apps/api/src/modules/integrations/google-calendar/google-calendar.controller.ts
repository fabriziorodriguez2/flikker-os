import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { MembershipRole } from '@prisma/client';
import { GoogleCalendarService } from './google-calendar.service';
import { SelectCalendarsDto } from './dto/select-calendars.dto';
import { PatchCalendarConfigDto } from './dto/patch-config.dto';
import { JwtGuard } from '../../auth/guards/jwt.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { verifyOAuthState } from '../../../common/utils/calendar-crypto.util';
import type { AuthenticatedRequest } from '../../../common/types/request.types';

@Controller('integrations/google-calendar')
export class GoogleCalendarController {
  constructor(private readonly service: GoogleCalendarService) {}

  // ── Protected endpoints ────────────────────────────────────────────────────

  @Get()
  @UseGuards(JwtGuard, TenantGuard, RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  getStatus(@Req() req: AuthenticatedRequest) {
    return this.service.getStatus(req.currentBusinessId!);
  }

  @Get('connect')
  @UseGuards(JwtGuard, TenantGuard, RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  getAuthUrl(@Req() req: AuthenticatedRequest) {
    return this.service.getAuthUrl(req.currentBusinessId!);
  }

  @Get('calendars')
  @UseGuards(JwtGuard, TenantGuard, RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  listCalendars(@Req() req: AuthenticatedRequest) {
    return this.service.listCalendars(req.currentBusinessId!);
  }

  @Patch('calendars')
  @UseGuards(JwtGuard, TenantGuard, RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  selectCalendars(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SelectCalendarsDto,
  ) {
    return this.service.selectCalendars(req.currentBusinessId!, dto);
  }

  @Patch('config')
  @UseGuards(JwtGuard, TenantGuard, RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  patchConfig(
    @Req() req: AuthenticatedRequest,
    @Body() dto: PatchCalendarConfigDto,
  ) {
    return this.service.patchConfig(req.currentBusinessId!, dto);
  }

  @Delete()
  @UseGuards(JwtGuard, TenantGuard, RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  disconnect(@Req() req: AuthenticatedRequest) {
    return this.service.disconnect(req.currentBusinessId!);
  }

  @Get('events')
  @UseGuards(JwtGuard, TenantGuard, RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  listEvents(
    @Req() req: AuthenticatedRequest,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.service.listEvents(req.currentBusinessId!, {
      limit: limit ? Number(limit) : undefined,
      status,
    });
  }

  @Patch('events/:id/skip')
  @UseGuards(JwtGuard, TenantGuard, RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  skipEvent(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.service.skipEvent(req.currentBusinessId!, id);
  }

  // ── Public OAuth callback (called by Google redirect) ─────────────────────

  @Get('callback')
  async handleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    const frontendUrl =
      process.env.APP_PUBLIC_URL?.replace(/\/$/, '') ?? 'http://localhost:3001';

    if (error || !code || !state) {
      return res.redirect(
        `${frontendUrl}/dashboard/integrations?calendar=error`,
      );
    }

    const parsed = verifyOAuthState(state);
    if (!parsed) {
      return res.redirect(
        `${frontendUrl}/dashboard/integrations?calendar=invalid_state`,
      );
    }

    try {
      await this.service.handleCallback(parsed.businessId, code);
      return res.redirect(
        `${frontendUrl}/dashboard/integrations?calendar=connected`,
      );
    } catch {
      return res.redirect(
        `${frontendUrl}/dashboard/integrations?calendar=error`,
      );
    }
  }
}
