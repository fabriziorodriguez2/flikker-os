import {
  IsString,
  IsOptional,
  IsEmail,
  IsUrl,
  MaxLength,
  Matches,
} from 'class-validator';

export class UpdateBusinessDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  legalName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  industry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsUrl()
  website?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000000)
  logoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(7)
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'primaryColor must be a hex color (e.g. #FF6B00)',
  })
  primaryColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(7)
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'secondaryColor must be a hex color (e.g. #1A1A1A)',
  })
  secondaryColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  toneOfVoice?: string;

  @IsOptional()
  @IsUrl()
  whatsappUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  shortBio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  signatureText?: string;

  @IsOptional()
  @IsUrl()
  googleBusinessProfileUrl?: string;

  @IsOptional()
  @IsUrl()
  defaultReviewRedirectUrl?: string;
}
