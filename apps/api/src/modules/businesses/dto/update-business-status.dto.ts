import { IsEnum } from 'class-validator';
import { BusinessStatus } from '@prisma/client';

export class UpdateBusinessStatusDto {
  @IsEnum(BusinessStatus)
  status: BusinessStatus;
}
