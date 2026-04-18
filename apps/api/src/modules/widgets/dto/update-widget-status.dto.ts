import { IsEnum } from 'class-validator';
import { WidgetStatus } from '@prisma/client';

export class UpdateWidgetStatusDto {
  @IsEnum(WidgetStatus)
  status!: WidgetStatus;
}
