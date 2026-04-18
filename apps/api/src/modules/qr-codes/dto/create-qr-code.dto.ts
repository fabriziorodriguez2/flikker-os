import {
  IsString,
  IsOptional,
  IsUUID,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class CreateQrCodeDto {
  @IsUUID()
  campaignId: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @IsOptional()
  @IsUrl()
  destinationUrl?: string;
}
