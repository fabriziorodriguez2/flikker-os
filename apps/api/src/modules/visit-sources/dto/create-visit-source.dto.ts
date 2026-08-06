import { VisitSourceType } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateVisitSourceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  /** Defaults to `qr` when omitted. */
  @IsOptional()
  @IsEnum(VisitSourceType)
  type?: VisitSourceType;
}
