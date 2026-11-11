import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConsentSource, MembershipRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import type { AuthenticatedRequest } from '../../common/types/request.types';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { PolicyService } from './policy.service';
import { PolicyGateService } from './policy-gate.service';
import { ConsentService } from './consent.service';
import {
  AcceptPolicyDto,
  RecordConsentDto,
  SetMessageCostDto,
  UpdatePolicyDto,
} from './dto/policy.dto';

/**
 * Política del negocio activo. Leer es de cualquier miembro (todos tienen
 * que poder ver por qué algo no se envió); aceptar, editar y reanudar es
 * solo del dueño; pausar (el kill switch) también puede un admin, porque
 * frenar nunca cuesta plata.
 */
@Controller('policy')
@UseGuards(JwtGuard, TenantGuard, RolesGuard)
export class PolicyController {
  constructor(private readonly policies: PolicyService) {}

  @Get()
  view(@Req() req: AuthenticatedRequest) {
    return this.policies.view(req.currentBusinessId!);
  }

  @Post('accept')
  @HttpCode(200)
  @Roles(MembershipRole.OWNER)
  accept(@Req() req: AuthenticatedRequest, @Body() dto: AcceptPolicyDto) {
    return this.policies.accept(req.currentBusinessId!, req.user.id, dto);
  }

  @Put()
  @Roles(MembershipRole.OWNER)
  update(@Req() req: AuthenticatedRequest, @Body() dto: UpdatePolicyDto) {
    return this.policies.update(req.currentBusinessId!, req.user.id, dto);
  }

  @Post('pause')
  @HttpCode(200)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  async pause(@Req() req: AuthenticatedRequest) {
    await this.policies.pause(req.currentBusinessId!, req.user.id, 'MANUAL');
    return this.policies.view(req.currentBusinessId!);
  }

  @Post('resume')
  @HttpCode(200)
  @Roles(MembershipRole.OWNER)
  resume(@Req() req: AuthenticatedRequest) {
    return this.policies.resume(req.currentBusinessId!, req.user.id);
  }
}

/**
 * Consentimiento de un cliente del negocio activo. El staff registra lo que
 * el cliente dijo (alta o baja); suprimir o levantar una supresión es de
 * dueño/admin. El cliente se busca siempre dentro del negocio activo: un id
 * de otro negocio responde 404.
 */
@Controller('customers')
@UseGuards(JwtGuard, TenantGuard, RolesGuard)
export class ConsentController {
  constructor(
    private readonly consent: ConsentService,
    private readonly gate: PolicyGateService,
  ) {}

  @Get(':id/consent')
  history(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.consent.history(req.currentBusinessId!, id);
  }

  @Post(':id/consent')
  @HttpCode(200)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.OPERATOR)
  async record(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordConsentDto,
  ) {
    const role = req.currentMembershipRole;
    const suppression =
      dto.action === 'SUPPRESSED' || dto.action === 'UNSUPPRESSED';
    if (suppression && role !== 'OWNER' && role !== 'ADMIN') {
      throw new ForbiddenException(
        'Solo el dueño o un admin pueden suprimir o levantar una supresión.',
      );
    }
    const businessId = req.currentBusinessId!;
    const status = await this.consent.record({
      businessId,
      customerId: id,
      channel: dto.channel,
      action: dto.action,
      source:
        dto.action === 'SUPPRESSED' && dto.complaint
          ? ConsentSource.COMPLAINT
          : ConsentSource.STAFF,
      actorUserId: req.user.id,
      note: dto.note ?? null,
    });
    if (dto.action === 'REVOKED' || dto.action === 'SUPPRESSED') {
      await this.gate.checkHealth(businessId);
    }
    return { status, ...(await this.consent.history(businessId, id)) };
  }
}

/** Platform Admin: costo por mensaje (el proveedor actual no lo informa). */
@Controller('platform/businesses')
@UseGuards(JwtGuard, PlatformAdminGuard)
export class PolicyPlatformController {
  constructor(private readonly policies: PolicyService) {}

  @Get(':businessId/policy')
  view(@Param('businessId', ParseUUIDPipe) businessId: string) {
    return this.policies.view(businessId);
  }

  @Patch(':businessId/policy/message-cost')
  setMessageCost(
    @Req() req: AuthenticatedRequest,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body() dto: SetMessageCostDto,
  ) {
    return this.policies.setMessageUnitCost(
      businessId,
      req.user.id,
      dto.unitCost,
      dto.currency,
    );
  }
}
