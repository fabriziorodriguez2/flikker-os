import { Controller, Get, Post, Param, Body, HttpCode } from '@nestjs/common';
import { IsString, IsNotEmpty } from 'class-validator';
import { PublicService } from './public.service';

class CaptureContactDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  phone!: string;
}

@Controller('public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Get('qr/:businessId')
  getQrInfo(@Param('businessId') businessId: string) {
    return this.publicService.getQrInfo(businessId);
  }

  @Post('qr/:businessId/capture')
  @HttpCode(200)
  captureContact(
    @Param('businessId') businessId: string,
    @Body() body: CaptureContactDto,
  ) {
    return this.publicService.captureContact(businessId, body.name, body.phone);
  }
}
