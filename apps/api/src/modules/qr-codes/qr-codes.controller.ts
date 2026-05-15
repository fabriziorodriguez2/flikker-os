import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  Res,
  Header,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { MembershipRole } from '@prisma/client';
import { QrCodesService } from './qr-codes.service';
import { QrGeneratorService } from './qr-generator.service';
import { CampaignStatsService } from '../campaigns/campaigns.stats.service';
import { CreateQrCodeDto } from './dto/create-qr-code.dto';
import { UpdateQrCodeDto } from './dto/update-qr-code.dto';
import { StatsQueryDto } from '../campaigns/dto/stats-query.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { FeatureFlagGuard } from '../../common/guards/feature-flag.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../../common/types/request.types';

@Controller('qr-codes')
export class QrCodesController {
  constructor(
    private readonly qrCodesService: QrCodesService,
    private readonly qrGeneratorService: QrGeneratorService,
    private readonly statsService: CampaignStatsService,
  ) {}

  /**
   * Lists QR codes for a campaign. Requires ?campaignId query param.
   */
  @Get()
  @UseGuards(JwtGuard, TenantGuard)
  list(
    @Req() req: AuthenticatedRequest,
    @Query('campaignId', ParseUUIDPipe) campaignId: string,
  ) {
    return this.qrCodesService.listForCampaign(
      req.currentBusinessId!,
      campaignId,
    );
  }

  /**
   * Returns a specific QR code — must belong to the current business.
   */
  @Get(':id')
  @UseGuards(JwtGuard, TenantGuard)
  findOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.qrCodesService.findOneScoped(req.currentBusinessId!, id);
  }

  /**
   * Returns scan stats for a QR code.
   * Optional query: ?from=YYYY-MM-DD&to=YYYY-MM-DD (defaults to last 30 days).
   */
  @Get(':id/stats')
  @UseGuards(JwtGuard, TenantGuard)
  async stats(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query() query: StatsQueryDto,
  ) {
    await this.qrCodesService.findOneScoped(req.currentBusinessId!, id);
    const range = CampaignStatsService.resolveDateRange(query.from, query.to);
    return this.statsService.getQrCodeStats(req.currentBusinessId!, id, range);
  }

  /**
   * Creates a new QR code — OWNER or ADMIN only.
   */
  @Post()
  @UseGuards(JwtGuard, TenantGuard, RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateQrCodeDto) {
    return this.qrCodesService.create(req.currentBusinessId!, dto);
  }

  /**
   * Updates a QR code (label, isActive, destinationUrl) — OWNER or ADMIN only.
   */
  @Patch(':id')
  @UseGuards(JwtGuard, TenantGuard, RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateQrCodeDto,
  ) {
    return this.qrCodesService.update(req.currentBusinessId!, id, dto);
  }

  /**
   * Downloads the QR code as PNG.
   */
  @Get(':id/download/png')
  @UseGuards(FeatureFlagGuard('QR_ADVANCED'), JwtGuard, TenantGuard)
  @Header('Cache-Control', 'private, max-age=3600')
  async downloadPng(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const qr = await this.qrCodesService.findOneScoped(
      req.currentBusinessId!,
      id,
    );
    const buffer = await this.qrGeneratorService.generatePng(qr.slug);

    res.set({
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="qr-${qr.slug}.png"`,
    });
    res.send(buffer);
  }

  /**
   * Downloads the QR code as SVG.
   */
  @Get(':id/download/svg')
  @UseGuards(FeatureFlagGuard('QR_ADVANCED'), JwtGuard, TenantGuard)
  @Header('Cache-Control', 'private, max-age=3600')
  async downloadSvg(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const qr = await this.qrCodesService.findOneScoped(
      req.currentBusinessId!,
      id,
    );
    const svg = await this.qrGeneratorService.generateSvg(qr.slug);

    res.set({
      'Content-Type': 'image/svg+xml',
      'Content-Disposition': `attachment; filename="qr-${qr.slug}.svg"`,
    });
    res.send(svg);
  }

  /**
   * Downloads the QR code as PDF (A6, print-ready).
   */
  @Get(':id/download/pdf')
  @UseGuards(FeatureFlagGuard('QR_ADVANCED'), JwtGuard, TenantGuard)
  @Header('Cache-Control', 'private, max-age=3600')
  async downloadPdf(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const qr = await this.qrCodesService.findOneScoped(
      req.currentBusinessId!,
      id,
    );
    const buffer = await this.qrGeneratorService.generatePdf(
      qr.slug,
      qr.label  undefined,
    );

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="qr-${qr.slug}.pdf"`,
    });
    res.send(buffer);
  }
}
