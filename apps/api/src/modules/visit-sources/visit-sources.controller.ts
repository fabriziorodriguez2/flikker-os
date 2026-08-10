import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { MembershipRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CheckinV2Guard } from '../../common/guards/checkin-v2.guard';
import type { AuthenticatedRequest } from '../../common/types/request.types';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { VisitSourcesService } from './visit-sources.service';
import { CreateVisitSourceDto } from './dto/create-visit-source.dto';
import { UpdateVisitSourceDto } from './dto/update-visit-source.dto';

@Controller('visit-sources')
@UseGuards(JwtGuard, TenantGuard, CheckinV2Guard)
export class VisitSourcesController {
  constructor(private readonly service: VisitSourcesService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.service.list(req.currentBusinessId!);
  }

  @Get(':id')
  getOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.getOne(req.currentBusinessId!, id);
  }

  // Bug real (pre-piloto #1): sin @Res(), Nest ve el Buffer devuelto como un
  // "object" y responde con `response.json(buffer)` en vez de
  // `response.send(buffer)` — el archivo descargado terminaba siendo el
  // texto `{"type":"Buffer","data":[...]}`, no bytes PNG reales. Mismo
  // patrón correcto que ya usa qr-codes.controller.ts.
  @Get(':id/qr')
  async getQr(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const buffer = await this.service.getQrPng(req.currentBusinessId!, id);
    res.set({
      'Content-Type': 'image/png',
      'Content-Disposition': 'attachment; filename="checkin-qr.png"',
    });
    res.send(buffer);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateVisitSourceDto) {
    return this.service.create(req.currentBusinessId!, dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateVisitSourceDto,
  ) {
    return this.service.update(req.currentBusinessId!, id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.remove(req.currentBusinessId!, id);
  }
}
