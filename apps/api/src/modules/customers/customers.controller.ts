import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MembershipRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import type { AuthenticatedRequest } from '../../common/types/request.types';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { PreviewFilterDto } from './dto/preview-filter.dto';
import { NotifyAppointmentDto } from './dto/notify-appointment.dto';
import { CustomersService } from './customers.service';

@Controller('customers')
@UseGuards(JwtGuard, TenantGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  list(
    @Req() req: AuthenticatedRequest,
    @Query()
    query: {
      search?: string;
      page?: string;
      limit?: string;
      origin?: string;
      from?: string;
      to?: string;
    },
  ) {
    return this.customersService.list(req.currentBusinessId!, query);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.OPERATOR)
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateCustomerDto) {
    return this.customersService.create(req.currentBusinessId!, dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.OPERATOR)
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customersService.update(req.currentBusinessId!, id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.customersService.softDelete(req.currentBusinessId!, id);
  }

  @Post(':id/opt-out')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.OPERATOR)
  optOut(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.customersService.optOut(req.currentBusinessId!, id);
  }

  @Post(':id/notify-appointment')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.OPERATOR)
  notifyAppointment(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: NotifyAppointmentDto,
  ) {
    return this.customersService.notifyAppointment(
      req.currentBusinessId!,
      id,
      dto,
    );
  }

  @Post('import-csv')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.OPERATOR)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  importCsv(
    @Req() req: AuthenticatedRequest,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('mapping') mapping?: string,
  ) {
    if (!file) throw new BadRequestException('Archivo requerido');
    return this.customersService.importFile(req.currentBusinessId!, {
      file,
      mapping,
    });
  }

  @Get('filter-counts')
  filterCounts(@Req() req: AuthenticatedRequest) {
    return this.customersService.getFilterCounts(req.currentBusinessId!);
  }

  @Post('filter-preview')
  filterPreview(
    @Req() req: AuthenticatedRequest,
    @Body() dto: PreviewFilterDto,
  ) {
    return this.customersService.previewFilter(
      req.currentBusinessId!,
      dto.mode,
      dto.origins,
    );
  }
}

@Controller('contacts')
@UseGuards(JwtGuard, TenantGuard)
export class ContactsController {
  constructor(private readonly customersService: CustomersService) {}

  @Post(':contactId/notify-appointment')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.OPERATOR)
  notifyAppointment(
    @Req() req: AuthenticatedRequest,
    @Param('contactId') contactId: string,
    @Body() dto: NotifyAppointmentDto,
  ) {
    return this.customersService.notifyAppointment(
      req.currentBusinessId!,
      contactId,
      dto,
    );
  }
}
