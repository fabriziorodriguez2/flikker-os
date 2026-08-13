import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OnboardingService } from './onboarding.service';
import {
  OnboardingBusinessDto,
  OnboardingDesignDto,
  OnboardingGoogleDto,
  OnboardingNotificationsDto,
  OnboardingProgramDto,
  OnboardingWelcomeGiftDto,
} from './dto/onboarding.dto';

/**
 * Onboarding self-service. Solo `JwtGuard`: deliberadamente SIN `TenantGuard`
 * ni `RolesGuard`, porque en el paso 1 todavía no existe el negocio del que
 * derivar tenancy o rol — el usuario autenticado se convierte en su OWNER.
 *
 * Todo lo que viene después se scopea al negocio-borrador de ESE usuario
 * (`onboardingCompletedAt: null` + membresía OWNER activa), que el service
 * resuelve internamente: ningún endpoint acepta un `businessId` del cliente,
 * así que no hay forma de tocar el negocio de otro.
 */
@Controller('onboarding')
@UseGuards(JwtGuard)
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get('state')
  getState(@CurrentUser() user: { id: string }) {
    return this.onboarding.getState(user.id);
  }

  @Post('business')
  saveBusiness(
    @CurrentUser() user: { id: string },
    @Body() dto: OnboardingBusinessDto,
  ) {
    return this.onboarding.saveBusiness(user.id, dto);
  }

  @Post('program')
  saveProgram(
    @CurrentUser() user: { id: string },
    @Body() dto: OnboardingProgramDto,
  ) {
    return this.onboarding.saveProgram(user.id, dto);
  }

  @Post('welcome-gift')
  saveWelcomeGift(
    @CurrentUser() user: { id: string },
    @Body() dto: OnboardingWelcomeGiftDto,
  ) {
    return this.onboarding.saveWelcomeGift(user.id, dto);
  }

  @Post('design')
  saveDesign(
    @CurrentUser() user: { id: string },
    @Body() dto: OnboardingDesignDto,
  ) {
    return this.onboarding.saveDesign(user.id, dto);
  }

  @Post('google')
  saveGoogle(
    @CurrentUser() user: { id: string },
    @Body() dto: OnboardingGoogleDto,
  ) {
    return this.onboarding.saveGoogle(user.id, dto);
  }

  @Post('notifications')
  saveNotifications(
    @CurrentUser() user: { id: string },
    @Body() dto: OnboardingNotificationsDto,
  ) {
    return this.onboarding.saveNotifications(user.id, dto);
  }

  @Post('complete')
  complete(@CurrentUser() user: { id: string }) {
    return this.onboarding.complete(user.id);
  }
}
