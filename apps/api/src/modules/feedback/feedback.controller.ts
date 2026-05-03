import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { SubmitFeedbackDto } from './dto/submit-feedback.dto';
import { FeedbackService } from './feedback.service';

@Controller('feedback')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 60, ttl: 60000 } })
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Get(':token')
  getByToken(@Param('token') token: string) {
    return this.feedbackService.getByToken(token);
  }

  @Post(':token')
  submit(@Param('token') token: string, @Body() dto: SubmitFeedbackDto) {
    return this.feedbackService.submit(token, dto);
  }
}
