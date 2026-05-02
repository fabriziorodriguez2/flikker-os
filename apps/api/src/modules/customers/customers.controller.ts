import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
import { CreateCustomerDto } from './dto/create-customer.dto';
import { ImportCsvDto } from './dto/import-csv.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomersService } from './customers.service';

@Controller('customers')
@UseGuards(JwtGuard, TenantGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  list(
    @Req() req: AuthenticatedRequest,
    @Query() query: { search?: string; page?: string; limit?: string },
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

  @Post('import-csv')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.OPERATOR)
  importCsv(@Req() req: AuthenticatedRequest, @Body() dto: ImportCsvDto) {
    return this.customersService.importCsv(req.currentBusinessId!, dto);
  }
}
