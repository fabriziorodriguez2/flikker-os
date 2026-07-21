import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import type { AuthenticatedRequest } from '../../common/types/request.types';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RetentionService } from './retention.service';
import { SaveRetentionSequenceDto } from './dto/save-retention-sequence.dto';

@Controller('retention')
@UseGuards(JwtGuard, TenantGuard)
export class RetentionController {
  constructor(private readonly service: RetentionService) {}

  @Get('sequence')
  getSequence(@Req() req: AuthenticatedRequest) {
    return this.service.get(req.currentBusinessId!);
  }

  @Put('sequence')
  @UseGuards(RolesGuard)
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  saveSequence(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SaveRetentionSequenceDto,
  ) {
    return this.service.save(req.currentBusinessId!, dto);
  }
}
