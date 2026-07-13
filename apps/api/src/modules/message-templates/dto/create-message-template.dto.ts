import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateMessageTemplateDto {
  @IsString()
  @MaxLength(50)
  title: string;

  @IsString()
  @MaxLength(1000)
  body: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  vertical?: string;

  @IsString()
  @IsOptional()
  @MaxLength(30)
  tag?: string;
}
