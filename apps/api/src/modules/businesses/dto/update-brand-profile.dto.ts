import {
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  IsOptional,
  IsUrl,
  Max,
  MaxLength,
  Matches,
  Min,
} from 'class-validator';

/** Mismas 8 keys que `STAMP_BACKGROUND_PATTERNS` en apps/web/lib/loyalty-stamp-patterns.ts. */
const LOYALTY_STAMP_BACKGROUND_PATTERNS = [
  'none',
  'waves',
  'bubbles',
  'arcs',
  'curved-lines',
  'organic',
  'geometric',
  'confetti',
] as const;

export class UpdateBrandProfileDto {
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
  @IsUrl()
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  shortBio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  signatureText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  benefitText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  qrA4Title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  qrA4Subtitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(7)
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'qrA4BgColor must be a hex color (e.g. #1A1040)',
  })
  qrA4BgColor?: string;

  /** Programa → Diseño de tarjeta. El cliente valida contraste al renderizar. */
  @IsOptional()
  @IsString()
  @MaxLength(7)
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'loyaltyCardColor must be a hex color (e.g. #1A1040)',
  })
  loyaltyCardColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(7)
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'loyaltyCardTextColor must be a hex color (e.g. #FFFFFF)',
  })
  loyaltyCardTextColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000000)
  loyaltyCardBackgroundImage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(7)
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'loyaltyStampAreaColor must be a hex color (e.g. #4285F4)',
  })
  loyaltyStampAreaColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(7)
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'loyaltyStampColor must be a hex color (e.g. #FFAB76)',
  })
  loyaltyStampColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500000)
  loyaltyStampIcon?: string;

  @IsOptional()
  @IsBoolean()
  loyaltyShowBusinessName?: boolean;

  /** Programa → Diseño de sellos. Fondo decorativo detrás de los sellos. */
  @IsOptional()
  @IsIn(LOYALTY_STAMP_BACKGROUND_PATTERNS)
  loyaltyStampBackgroundPattern?: string;

  /** 0-100. Ausente/null = Automático. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  loyaltyStampBackgroundOpacity?: number;

  /**
   * Programa → Página de inscripción. Encabezado propio de la landing
   * pública de check-in — distinto de `benefitText`, que además gobierna el
   * subtítulo/botón de esa página y el mensaje de WhatsApp post-registro.
   */
  @IsOptional()
  @IsString()
  @MaxLength(160)
  checkinWelcomeMessage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(7)
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'checkinBackgroundColor must be a hex color (e.g. #5C6BC0)',
  })
  checkinBackgroundColor?: string;

  @IsOptional()
  @IsUrl()
  googleBusinessProfileUrl?: string;

  @IsOptional()
  @IsUrl()
  defaultReviewRedirectUrl?: string;
}
