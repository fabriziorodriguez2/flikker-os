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
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import type { AuthenticatedRequest } from '../../common/types/request.types';
import { BusinessesService } from './businesses.service';
import { CreateBusinessDto } from './dto/create-business.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { UpdateBusinessStatusDto } from './dto/update-business-status.dto';
import { UpdateBrandProfileDto } from './dto/update-brand-profile.dto';
import { ConnectGooglePlaceDto } from './dto/connect-google-place.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('businesses')
@UseGuards(JwtGuard)
export class BusinessesController {
  constructor(private readonly businessesService: BusinessesService) {}

  /**
   * Creates a new business — no tenant context needed (user is creating a new one).
   * The service makes the creator the OWNER.
   */
  @Post()
  create(@Body() dto: CreateBusinessDto, @CurrentUser() user: { id: string }) {
    return this.businessesService.create(dto, user.id);
  }

  /**
   * Lists all businesses the authenticated user belongs to.
   * Tenancy enforced at service level — no x-business-id needed.
   */
  @Get()
  findAll(@CurrentUser() user: { id: string }) {
    return this.businessesService.findAllForUser(user.id);
  }

  /**
   * Returns the business from the current tenant context (x-business-id).
   * Declared before :id to avoid route collision.
   */
  @Get('current')
  @UseGuards(TenantGuard)
  findCurrent(@Req() req: AuthenticatedRequest) {
    return this.businessesService.findCurrent(req.currentBusinessId!);
  }

  /**
   * Returns the brand profile of the current business.
   */
  @Get('current/brand')
  @UseGuards(TenantGuard)
  getBrandProfile(@Req() req: AuthenticatedRequest) {
    return this.businessesService.getBrandProfile(req.currentBusinessId!);
  }

  /**
   * Updates the brand profile of the current business — OWNER or ADMIN only.
   */
  @Patch('current/brand')
  @UseGuards(TenantGuard, RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  updateBrandProfile(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateBrandProfileDto,
  ) {
    return this.businessesService.updateBrandProfile(
      req.currentBusinessId!,
      dto,
    );
  }

  /**
   * Configuración → Suscripción. Lectura abierta a cualquier miembro del
   * negocio (igual que `GET current`) — la pantalla en sí ya está detrás de
   * `managersOnly` en el sidebar, pero el dato no es sensible entre tenants.
   */
  @Get('current/subscription')
  @UseGuards(TenantGuard)
  getSubscription(@Req() req: AuthenticatedRequest) {
    return this.businessesService.getSubscriptionOverview(
      req.currentBusinessId!,
    );
  }

  /**
   * Google Places API (New) — Reseñas → Conectar Google, paso "buscá tu
   * negocio". Reemplaza pegar un Place ID a mano por buscar por nombre.
   * Reservado a OWNER/ADMIN: es una escritura potencial (el resultado se
   * usa para conectar), no una lectura pública.
   */
  @Get('current/google-places/search')
  @UseGuards(TenantGuard, RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  searchGooglePlaces(@Query('query') query: string) {
    return this.businessesService.searchGooglePlaces(query);
  }

  /**
   * Conecta el Place elegido: guarda placeId + datos de solo lectura
   * (nombre, dirección, rating, links de Maps) y dispara el scrape inicial
   * de reseñas — mismo pipeline que ya usa `verify-google-place` (Scrape.do
   * + `GoogleReviewDetectionQueue`), sin duplicarlo.
   */
  @Post('current/google-places/connect')
  @UseGuards(TenantGuard, RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  connectGooglePlace(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ConnectGooglePlaceDto,
  ) {
    return this.businessesService.connectGooglePlace(
      req.currentBusinessId!,
      dto.placeId,
    );
  }

  @Get(':id/verify-google-place')
  verifyGooglePlace(
    @Param('id') businessId: string,
    @Query('placeId') placeId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.businessesService.verifyGooglePlace(
      businessId,
      user.id,
      placeId,
    );
  }

  @Post(':id/verify-whatsapp')
  verifyWhatsApp(
    @Param('id') businessId: string,
    @Body() body: { phone?: string },
    @CurrentUser() user: { id: string },
  ) {
    return this.businessesService.verifyWhatsApp(
      businessId,
      user.id,
      body.phone,
    );
  }

  /**
   * Returns a specific business.
   * TenantGuard validates membership; we use the trusted currentBusinessId.
   */
  @Get(':id')
  @UseGuards(TenantGuard)
  findOne(@Req() req: AuthenticatedRequest) {
    return this.businessesService.findCurrent(req.currentBusinessId!);
  }

  /**
   * Updates business profile — requires OWNER or ADMIN role.
   * TenantGuard validates membership; RolesGuard checks the role.
   */
  @Patch(':id')
  @UseGuards(TenantGuard, RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  update(@Req() req: AuthenticatedRequest, @Body() dto: UpdateBusinessDto) {
    return this.businessesService.update(
      req.currentBusinessId!,
      dto,
      req.user.id,
    );
  }

  /**
   * Changes business status — OWNER only. Validates transition rules.
   */
  @Patch(':id/status')
  @UseGuards(TenantGuard, RolesGuard)
  @Roles(MembershipRole.OWNER)
  updateStatus(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateBusinessStatusDto,
  ) {
    return this.businessesService.updateStatus(req.currentBusinessId!, dto);
  }
}
