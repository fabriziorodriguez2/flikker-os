import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export enum SignupVertical {
  DENTAL = 'dental',
  ESTETICA = 'estetica',
  FISIO = 'fisio',
  GIMNASIO = 'gimnasio',
  OTRO = 'otro',
}

export class SignupDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @MinLength(2)
  businessName: string;

  @IsEnum(SignupVertical)
  vertical: SignupVertical;

  @IsOptional()
  @IsString()
  timezone?: string;
}
