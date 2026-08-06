import {
  Body,
  Controller,
  HttpCode,
  Headers,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { FlikkerAccountService } from './flikker-account.service';
import { StartVerificationDto, VerifyDto } from './dto/flikker-account.dto';

/**
 * Public, unauthenticated "Mi Flikker" identity API (Fase E §21). Fully
 * separate from `public/checkin` — different cookie, different header
 * (`x-flikker-account-session`, never `x-flikker-session`), different trust
 * boundary. Nothing here can resolve, create, or touch a business-scoped
 * `CustomerSession`.
 */
@Controller('public/flikker-account')
export class FlikkerAccountController {
  constructor(private readonly service: FlikkerAccountService) {}

  @Post('verify/start')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  startVerification(@Body() dto: StartVerificationDto) {
    return this.service.startVerification(dto.phone);
  }

  @Post('verify/confirm')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  verify(@Body() dto: VerifyDto, @Headers('user-agent') userAgent?: string) {
    return this.service.verifyAndIssueSession(dto.phone, dto.code, userAgent);
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Headers('x-flikker-account-session') session?: string) {
    return this.service.logout(session);
  }
}
