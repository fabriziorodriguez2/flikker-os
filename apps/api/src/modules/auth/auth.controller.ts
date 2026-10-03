import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { LogoutDto } from './dto/logout.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SignupDto } from './dto/signup.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtGuard } from './guards/jwt.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PreOnboardingCheckoutService } from './pre-onboarding-checkout.service';
import { CreateProCheckoutDto } from '../businesses/dto/create-pro-checkout.dto';
import { UpdateNotificationWhatsAppDto } from './dto/update-notification-whatsapp.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly preOnboardingCheckout: PreOnboardingCheckoutService,
  ) {}

  @Post('signup')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Post('verify-email')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  verifyEmail(@Body() dto: VerifyEmailDto, @Req() req: Request) {
    return this.authService.verifyEmail(dto, req.headers['user-agent'], req.ip);
  }

  @Post('resend-verification')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 3600000 } })
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerification(dto);
  }

  @Post('login')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, req.headers['user-agent'], req.ip);
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto);
  }

  @Post('logout')
  logout(@Body() dto: LogoutDto) {
    return this.authService.logout(dto);
  }

  @Post('forgot-password')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 3600000 } })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @UseGuards(JwtGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  @Post('change-password')
  changePassword(
    @CurrentUser() user: { id: string },
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.id, dto);
  }

  @UseGuards(JwtGuard)
  @Get('me')
  me(@CurrentUser() user: { id: string }) {
    return this.authService.me(user.id);
  }

  @UseGuards(JwtGuard)
  @Get('memberships')
  memberships(@CurrentUser() user: { id: string }) {
    return this.authService.memberships(user.id);
  }

  @UseGuards(JwtGuard)
  @Post('me/onboarding-complete')
  markOnboardingComplete(@CurrentUser() user: { id: string }) {
    return this.authService.markOnboardingComplete(user.id);
  }

  @UseGuards(JwtGuard)
  @Post('me/consume-pending-upgrade-plan')
  consumePendingUpgradePlan(@CurrentUser() user: { id: string }) {
    return this.authService.consumePendingUpgradePlan(user.id);
  }

  @UseGuards(JwtGuard)
  @Patch('me/notification-whatsapp')
  updateNotificationWhatsapp(
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateNotificationWhatsAppDto,
  ) {
    return this.authService.updateNotificationWhatsapp(user.id, dto.phone);
  }

  /**
   * Checkout Pro PRE-onboarding (Parte 5D) — para un User que todavía no
   * tiene Business. El upgrade de un Business FREE existente sigue siendo
   * `POST /businesses/current/checkout`, sin tocar.
   */
  @UseGuards(JwtGuard)
  @Post('me/checkout')
  createPreOnboardingCheckout(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateProCheckoutDto,
  ) {
    return this.preOnboardingCheckout.createCheckout(user.id, dto.plan);
  }

  @UseGuards(JwtGuard)
  @Get('me/checkout')
  getPreOnboardingCheckoutStatus(@CurrentUser() user: { id: string }) {
    return this.preOnboardingCheckout.getStatus(user.id);
  }
}
