import { IsOptional, IsString, MaxLength } from 'class-validator';

export class TestRenderDto {
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
