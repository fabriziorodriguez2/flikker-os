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
import {
  CustomerLoyaltyService,
  type LoyaltyFilter,
} from './loyalty/customer-loyalty.service';
import { CustomerOverviewService } from './loyalty/customer-overview.service';

@Controller('customers')
@UseGuards(JwtGuard, TenantGuard)
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly loyaltyService: CustomerLoyaltyService,
    private readonly overviewService: CustomerOverviewService,
  ) {}

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

  /**
   * Lista de Clientes vista como fidelización: progreso, visitas, última
   * visita y estado, en una sola llamada junto con los KPIs.
   *
   * Se declara ANTES que cualquier `:id` para que la palabra "loyalty" no sea
   * capturada como un id de cliente.
   *
   * Solo lectura y sin `RolesGuard`: cualquier miembro activo del negocio
   * puede mirar sus clientes. El rol viaja al service únicamente para decidir
   * cuánto del teléfono se muestra.
   */
  @Get('loyalty')
  loyalty(
    @Req() req: AuthenticatedRequest,
    @Query()
    query: {
      filter?: LoyaltyFilter;
      search?: string;
      page?: string;
      limit?: string;
    },
  ) {
    return this.loyaltyService.list(req.currentBusinessId!, {
      filter: query.filter,
      search: query.search,
      page: query.page ? Number(query.page) : undefined,
      limit: query.limit ? Number(query.limit) : undefined,
      role: req.currentMembershipRole,
    });
  }

  /**
   * Detalle agregado de UN cliente. El `businessId` sale del tenant context,
   * nunca del cliente: un id de otro negocio da 404.
   */
  @Get(':id/overview')
  overview(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.overviewService.overview(
      req.currentBusinessId!,
      id,
      req.currentMembershipRole,
    );
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

  @Get('stats')
  stats(@Req() req: AuthenticatedRequest) {
    return this.customersService.getContactsStats(req.currentBusinessId!);
  }

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
