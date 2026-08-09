import { OptimizationMode, SimulationScenario } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

/** §25 — every field is optional; omitted ones fall back to the scenario's own defaults. */
export class CreateSimulationRunDto {
  @IsEnum(SimulationScenario)
  scenario: SimulationScenario;

  @IsOptional()
  @IsInt()
  @Min(1)
  days?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  customerCount?: number;

  @IsOptional()
  @IsInt()
  seed?: number;

  @IsOptional()
  @IsBoolean()
  withAi?: boolean;

  @IsOptional()
  @IsEnum(OptimizationMode)
  optimizationMode?: OptimizationMode;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  checkinComplianceRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  aiFailureRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  messageFailureRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  rewardRedemptionRate?: number;
}
