import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  HttpCode,
  Headers,
} from '@nestjs/common';
import { IsString, IsNotEmpty, IsOptional, IsISO8601 } from 'class-validator';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { UseGuards } from '@nestjs/common';
import { PublicService } from './public.service';
import { CheckoutLeadsService } from './checkout-leads.service';
import { CreateCheckoutIntentDto } from './dto/create-checkout-intent.dto';

class CaptureContactDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  phone!: string;

  /** Optional ISO date (YYYY-MM-DD) of birthday. Stored as DateTime in DB. */
  @IsOptional()
  @IsISO8601()
  birthdate?: string;
}

@Controller('public')
export class PublicController {
  constructor(
    private readonly publicService: PublicService,
    private readonly checkoutLeads: CheckoutLeadsService,
  ) {}

  /**
   * El formulario de la landing. Público y sin auth: quien lo completa
   * todavía no tiene cuenta — ese es justamente el punto.
   *
   * Rate limit propio y más estricto que el global (60/min): 10 por hora por
   * IP, el mismo orden de magnitud que usa `auth.controller` para sus
   * endpoints públicos. Un negocio real llena este formulario una o dos
   * veces; diez por hora deja lugar de sobra para reintentos legítimos y
   * corta el scripting trivial sin necesidad de CAPTCHA.
   *
   * `Idempotency-Key` es opcional. Con key, dos POST iguales devuelven el
   * mismo lead — es la protección contra el doble click. Sin key, cada POST
   * es una intención nueva, que es lo correcto para alguien que vuelve otro
   * día o cambia de plan.
   *
   * Devuelve 201 (el default de @Post): se creó un recurso. Todavía NO
   * devuelve `checkoutUrl` — eso es el endpoint de abajo
   * (`POST checkout/intents/:id/checkout`), un paso aparte y explícito.
   */
  @Post('checkout/intents')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  createCheckoutIntent(
    @Body() body: CreateCheckoutIntentDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.checkoutLeads.createIntent(body, idempotencyKey);
  }

  /**
   * Transforma un `CheckoutLead` PENDING en un checkout real de Mercado
   * Pago. Público y sin auth, como el resto de este flujo — la persona
   * todavía no tiene cuenta. El `id` de la URL es el único dato que hace
   * falta: el backend ya tiene nombre/negocio/teléfono/email/plan del
   * lead, así que el body de este POST siempre va vacío. No se acepta (ni
   * se leería) un `amount` del cliente en ningún punto de este flujo — el
   * precio lo decide `resolveCheckoutPricing`, server-side.
   *
   * Idempotente por diseño (ver `CheckoutLeadsService.createCheckout`):
   * doble click, refresh o reintento nunca crean una segunda Order.
   *
   * Rate limit generoso a propósito — a diferencia de la creación del
   * lead, acá SÍ esperamos reintentos legítimos del propio frontend (la
   * persona recarga la página de checkout, por ejemplo), y ya son
   * idempotentes sin costo real.
   */
  @Post('checkout/intents/:id/checkout')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 3600000 } })
  createCheckout(@Param('id') id: string) {
    return this.checkoutLeads.createCheckout(id);
  }

  @Get('benefit-issuances/:id')
  getBenefitIssuance(@Param('id') id: string) {
    return this.publicService.getBenefitIssuance(id);
  }

  @Get('qr/:businessId')
  getQrInfo(
    @Param('businessId') businessId: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.publicService.getQrInfo(businessId, userAgent);
  }

  @Post('qr/:businessId/capture')
  @HttpCode(200)
  captureContact(
    @Param('businessId') businessId: string,
    @Body() body: CaptureContactDto,
  ) {
    return this.publicService.captureContact(
      businessId,
      body.name,
      body.phone,
      body.birthdate,
    );
  }
}
