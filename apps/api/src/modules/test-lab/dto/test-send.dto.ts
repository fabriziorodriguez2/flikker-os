import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class TestSendDto {
  @IsString()
  @MinLength(7)
  @MaxLength(20)
  @Matches(/^\+?[\d\s\-()]+$/, { message: 'Formato de teléfono inválido' })
  phone: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  clinicName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  offerText?: string;
}
