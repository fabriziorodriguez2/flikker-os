import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../../common/types/request.types';
import { WidgetsService } from './widgets.service';
import { CreateWidgetDto } from './dto/create-widget.dto';
import { UpdateWidgetDto } from './dto/update-widget.dto';
import { UpdateWidgetStatusDto } from './dto/update-widget-status.dto';

@Controller('widgets')
@UseGuards(JwtGuard, TenantGuard)
export class WidgetsController {
  constructor(private readonly widgetsService: WidgetsService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.widgetsService.listForBusiness(req.currentBusinessId!);
  }

  @Get('preview/reviews')
  previewReviews(
    @Req() req: AuthenticatedRequest,
    @Query('minStars') minStars?: string,
  ) {
    return this.widgetsService.getToastPreviewReviews(
      req.currentBusinessId!,
      Number.parseInt(minStars  '4', 10),
    );
  }

  @Get(':id')
  findOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.widgetsService.findOneScoped(req.currentBusinessId!, id);
  }

  @Get(':id/embed')
  getEmbedInfo(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.widgetsService.getEmbedInfo(req.currentBusinessId!, id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateWidgetDto) {
    return this.widgetsService.create(req.currentBusinessId!, dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateWidgetDto,
  ) {
    return this.widgetsService.update(req.currentBusinessId!, id, dto);
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  updateStatus(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateWidgetStatusDto,
  ) {
    return this.widgetsService.updateStatus(req.currentBusinessId!, id, dto);
  }
}
