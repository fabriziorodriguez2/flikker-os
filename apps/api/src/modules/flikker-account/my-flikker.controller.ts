import {
  Controller,
  Get,
  Headers,
  Param,
  UnauthorizedException,
} from '@nestjs/common';
import { FlikkerAccountService } from './flikker-account.service';
import { MyFlikkerService } from './my-flikker.service';

/**
 * Public, authenticated-by-global-session "Mi Flikker" read API. Every
 * endpoint here requires `x-flikker-account-session` to resolve to a live
 * `FlikkerAccountSession` — there is no other way in, and no business-scoped
 * `x-flikker-session` is ever accepted here (Fase E §4).
 */
@Controller('public/my-flikker')
export class MyFlikkerController {
  constructor(
    private readonly accounts: FlikkerAccountService,
    private readonly myFlikker: MyFlikkerService,
  ) {}

  @Get()
  async list(@Headers('x-flikker-account-session') session?: string) {
    const account = await this.requireAccount(session);
    return this.myFlikker.listPlaces(account.flikkerAccountId);
  }

  @Get(':businessId')
  async detail(
    @Param('businessId') businessId: string,
    @Headers('x-flikker-account-session') session?: string,
  ) {
    const account = await this.requireAccount(session);
    return this.myFlikker.placeDetail(account.flikkerAccountId, businessId);
  }

  /**
   * Punto único por el que pasan los dos endpoints — por eso el re-link vive
   * acá y no duplicado en cada uno. `syncLinkedCustomers` re-aplica el
   * vínculo del teléfono YA probado por OTP de esta cuenta a cualquier
   * `Customer` que haya aparecido después de la última verificación (ver el
   * comentario de ese método: sin esto, todo negocio al que el cliente se
   * sumó después de su último OTP quedaba invisible acá para siempre).
   */
  private async requireAccount(session: string | undefined) {
    const account = await this.accounts.resolveSession(session);
    if (!account) throw new UnauthorizedException('No session');
    await this.accounts.syncLinkedCustomers(account.flikkerAccountId);
    return account;
  }
}
