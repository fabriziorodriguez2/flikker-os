import { VisitSourceType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

// Manual partial of CreateVisitSourceDto (no @nestjs/mapped-types dependency).
export class UpdateVisitSourceDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsEnum(VisitSourceType)
  type?: VisitSourceType;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
