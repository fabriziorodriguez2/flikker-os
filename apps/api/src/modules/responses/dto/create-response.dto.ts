import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateResponseDto {
  @IsUUID()
  reviewId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  content!: string;
}
