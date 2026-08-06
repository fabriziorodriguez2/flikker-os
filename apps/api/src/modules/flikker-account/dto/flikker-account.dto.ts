import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class StartVerificationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phone!: string;
}

export class VerifyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phone!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'El código debe tener 6 dígitos' })
  code!: string;
}
