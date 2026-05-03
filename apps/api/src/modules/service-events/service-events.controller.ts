import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import type { AuthenticatedRequest } from '../../common/types/request.types';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { BatchServiceEventsCsvDto } from './dto/batch-service-events-csv.dto';
import { CreateServiceEventDto } from './dto/create-service-event.dto';
import { ServiceEventsService } from './service-events.service';

@Controller('service-events')
@UseGuards(JwtGuard, TenantGuard)
export class ServiceEventsController {
  constructor(private readonly serviceEventsService: ServiceEventsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.OPERATOR)
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateServiceEventDto) {
    return this.serviceEventsService.create(req.currentBusinessId!, dto);
  }

  @Get()
  list(
    @Req() req: AuthenticatedRequest,
    @Query() query: { page?: string; limit?: string },
  ) {
    return this.serviceEventsService.list(req.currentBusinessId!, query);
  }

  @Post('batch-csv')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.OPERATOR)
  batchCsv(
    @Req() req: AuthenticatedRequest,
    @Body() dto: BatchServiceEventsCsvDto,
  ) {
    return this.serviceEventsService.batchCsv(req.currentBusinessId!, dto);
  }
}
