import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ChatbotMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  message: string;
}
