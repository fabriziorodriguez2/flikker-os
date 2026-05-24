import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class UpsertShopifyIntegrationDto {
  @IsString()
  @IsNotEmpty()
  shopDomain!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  webhookSecret?: string;
}
