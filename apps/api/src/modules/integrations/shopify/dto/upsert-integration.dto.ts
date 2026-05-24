import { IsString, IsInt, IsNotEmpty, Min, Max, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class UpsertShopifyIntegrationDto {
  @IsString()
  @IsNotEmpty()
  shopDomain!: string;

  @IsString()
  @IsNotEmpty()
  webhookSecret!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(168)
  delayHours?: number;
}
