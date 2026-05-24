import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { ShopifyConfigService } from './shopify-config.service';
import { UpsertShopifyIntegrationDto } from './dto/upsert-integration.dto';
import { JwtGuard } from '../../auth/guards/jwt.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../../../common/types/request.types';

@Controller('integrations/shopify')
@UseGuards(JwtGuard, TenantGuard, RolesGuard)
@Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
export class ShopifyConfigController {
  constructor(private readonly shopifyConfigService: ShopifyConfigService) {}

  @Get()
  getIntegration(@Req() req: AuthenticatedRequest) {
    return this.shopifyConfigService.getIntegration(req.currentBusinessId!);
  }

  @Post()
  upsertIntegration(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpsertShopifyIntegrationDto,
  ) {
    return this.shopifyConfigService.upsertIntegration(req.currentBusinessId!, dto);
  }

  @Delete()
  deleteIntegration(@Req() req: AuthenticatedRequest) {
    return this.shopifyConfigService.deleteIntegration(req.currentBusinessId!);
  }

  @Get('orders')
  getRecentOrders(@Req() req: AuthenticatedRequest) {
    return this.shopifyConfigService.getRecentOrders(req.currentBusinessId!);
  }
}
