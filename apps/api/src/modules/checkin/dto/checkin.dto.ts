import {
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phone!: string;

  @IsOptional()
  @IsISO8601()
  birthdate?: string;
}

export class RecoverStartDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phone!: string;
}

export class RecoverVerifyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phone!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'El código debe tener 6 dígitos' })
  code!: string;
}

export class ClientEventDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  type!: string;
}

export class SubmitCheckinFeedbackDto {
  @IsInt()
  @Min(1)
  @Max(5)
  score!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
