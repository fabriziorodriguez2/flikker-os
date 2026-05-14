import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import type { AuthenticatedRequest } from '../../common/types/request.types';
import { MetricsService } from './metrics.service';

@Controller('metrics')
@UseGuards(JwtGuard, TenantGuard)
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('overview')
  overview(
    @Req() req: AuthenticatedRequest,
    @Query()
    query: {
      granularity?: string;
      from?: string;
      to?: string;
    },
  ) {
    return this.metricsService.getOverview(req.currentBusinessId!, query);
  }

  @Post('feedback/:feedbackId/acknowledge')
  async acknowledgeFeedback(
    @Req() req: AuthenticatedRequest,
    @Param('feedbackId') feedbackId: string,
  ) {
    const result = await this.metricsService.acknowledgeNegativeFeedback(
      req.currentBusinessId!,
      feedbackId,
    );
    if (!result) throw new NotFoundException('Feedback not found');
    return result;
  }
}
