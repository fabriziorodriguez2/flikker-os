import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { CreateWidgetEventDto } from './dto/create-widget-event.dto';
import { WidgetsService } from './widgets.service';

@Controller('public/widgets')
export class WidgetsPublicController {
  constructor(private readonly widgetsService: WidgetsService) {}

  @Get('business/:businessId')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @Header(
    'Cache-Control',
    'public, max-age=900, s-maxage=1800, stale-while-revalidate=3600',
  )
  getEmbeddableWidget(
    @Param('businessId') businessId: string,
    @Query('mode') mode?: string,
  ) {
    return this.widgetsService.getEmbeddableWidgetByBusiness(businessId, mode);
  }

  @Post('business/:businessId/events')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 300, ttl: 60000 } })
  @Header('Cache-Control', 'no-store')
  async trackEvent(
    @Param('businessId') businessId: string,
    @Body() dto: CreateWidgetEventDto,
  ) {
    await this.widgetsService.trackPublicEvent(businessId, dto);
    return { ok: true };
  }

  @Get(':publicToken')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  getPublicWidget(@Param('publicToken') publicToken: string) {
    return this.widgetsService.getPublicWidget(publicToken);
  }
}
