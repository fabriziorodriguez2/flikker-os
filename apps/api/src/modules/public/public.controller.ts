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
import { PublicService } from './public.service';

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
  constructor(private readonly publicService: PublicService) {}

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
