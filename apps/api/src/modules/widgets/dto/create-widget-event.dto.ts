import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { WidgetEventType } from '@prisma/client';

export class CreateWidgetEventDto {
  @IsEnum(WidgetEventType)
  eventType!: WidgetEventType;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  googleReviewId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  referrer?: string;
}
