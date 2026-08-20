import {
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class ManualRecipientDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsString()
  name: string;

  @IsString()
  phoneE164: string;

  /** Link personalizado de este destinatario, sustituido en el `{link}` del mensaje. */
  @IsOptional()
  @IsString()
  link?: string;
}

export class SendManualCampaignDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ManualRecipientDto)
  recipients: ManualRecipientDto[];

  @IsString()
  @MaxLength(1000)
  messageBody: string;
}
