import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { WidgetsService } from './widgets.service';

@Controller('public/widgets')
export class WidgetsPublicController {
  constructor(private readonly widgetsService: WidgetsService) {}

  @Get(':publicToken')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  getPublicWidget(@Param('publicToken') publicToken: string) {
    return this.widgetsService.getPublicWidget(publicToken);
  }
}
