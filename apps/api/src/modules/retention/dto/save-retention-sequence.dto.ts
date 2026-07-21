import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class RetentionStepInput {
  /** Days after the customer's registration when this message fires. */
  @IsInt()
  @Min(0)
  @Max(3650)
  offsetDays: number;

  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  messageBody: string;
}

export class SaveRetentionSequenceDto {
  @IsBoolean()
  enabled: boolean;

  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => RetentionStepInput)
  steps: RetentionStepInput[];
}
