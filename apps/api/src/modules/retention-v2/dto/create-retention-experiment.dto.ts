import { CustomerSegment, RetentionObjective } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateRetentionExperimentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsEnum(RetentionObjective)
  objective: RetentionObjective;

  /** Null (the default) means "any eligible segment for this objective". */
  @IsOptional()
  @IsEnum(CustomerSegment)
  segment?: CustomerSegment;
}
