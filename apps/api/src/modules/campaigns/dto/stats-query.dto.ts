import { IsOptional, IsDateString } from 'class-validator';

export class StatsQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
