import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { TestLabService } from './test-lab.service';
import { TestRenderDto } from './dto/test-render.dto';
import { TestSendDto } from './dto/test-send.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../../common/types/request.types';

@Controller('test-lab')
@UseGuards(JwtGuard, TenantGuard, RolesGuard)
@Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
export class TestLabController {
  constructor(private readonly testLabService: TestLabService) {}

  /**
   * Returns an overview of the active business for the test lab:
   * business info, campaigns, review count, widget config.
   */
  @Get('overview')
  overview(@Req() req: AuthenticatedRequest) {
    return this.testLabService.getOverview(req.currentBusinessId!);
  }

  /**
   * Renders a campaign message body with the provided variables.
   * No DB writes — safe to call repeatedly.
   */
  @Post('campaigns/:id/render')
  render(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: TestRenderDto,
  ) {
    return this.testLabService.renderMessage(req.currentBusinessId!, id, dto);
  }

  /**
   * Sends a REAL WhatsApp message for testing purposes.
   * Does NOT create a Message record or increment quota.
   * Requires explicit confirmation from the client.
   */
  @Post('campaigns/:id/send')
  sendTest(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: TestSendDto,
  ) {
    return this.testLabService.sendTest(req.currentBusinessId!, id, dto);
  }
}
