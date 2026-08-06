import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { CheckinService } from './checkin.service';
import {
  ClientEventDto,
  RecoverStartDto,
  RecoverVerifyDto,
  RegisterDto,
} from './dto/checkin.dto';

/**
 * Public, unauthenticated check-in API. The persistent-session token travels in
 * the `x-flikker-session` header (set by the web layer from an httpOnly cookie)
 * — never in the URL. Static `session` routes are declared before `:token` so
 * they are not captured as a token.
 */
@Controller('public/checkin')
export class CheckinController {
  constructor(private readonly service: CheckinService) {}

  @Get('session')
  me(@Headers('x-flikker-session') session?: string) {
    return this.service.me(session);
  }

  @Post('session/logout')
  @HttpCode(200)
  logout(@Headers('x-flikker-session') session?: string) {
    return this.service.logout(session);
  }

  @Get(':token')
  resolve(@Param('token') token: string) {
    return this.service.resolveLanding(token);
  }

  @Post(':token/register')
  @HttpCode(200)
  register(
    @Param('token') token: string,
    @Body() dto: RegisterDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.service.register(
      token,
      { name: dto.name, phone: dto.phone, birthdate: dto.birthdate },
      userAgent,
    );
  }

  @Post(':token/checkin')
  @HttpCode(200)
  checkin(
    @Param('token') token: string,
    @Headers('x-flikker-session') session?: string,
  ) {
    return this.service.checkin(token, session);
  }

  @Post(':token/recover/start')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  recoverStart(@Param('token') token: string, @Body() dto: RecoverStartDto) {
    return this.service.recoverStart(token, dto.phone);
  }

  @Post(':token/recover/verify')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  recoverVerify(
    @Param('token') token: string,
    @Body() dto: RecoverVerifyDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.service.recoverVerify(token, dto.phone, dto.code, userAgent);
  }

  @Post(':token/event')
  @HttpCode(200)
  event(
    @Param('token') token: string,
    @Body() dto: ClientEventDto,
    @Headers('x-flikker-session') session?: string,
  ) {
    return this.service.emitClientEvent(token, dto.type, session);
  }
}
