import { ServiceEventCreatedVia } from '@prisma/client';
import {
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateServiceEventDto {
  @IsUUID()
  customerId: string;

  @IsString()
  @IsNotEmpty()
  serviceType: string;

  @IsOptional()
  @IsISO8601()
  eventAt?: string;

  @IsIn([ServiceEventCreatedVia.manual_panel])
  createdVia: typeof ServiceEventCreatedVia.manual_panel;
}
