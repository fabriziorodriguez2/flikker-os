import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import type { AuthenticatedRequest } from '../../common/types/request.types';
import { ChatbotService } from './chatbot.service';
import { ChatbotMessageDto } from './dto/chatbot-message.dto';
import { SUGGESTED_QUESTION_IDS, findHelpFaqEntry } from './chatbot-help-kb';

/**
 * "Preguntale a Flikker" — `businessId` siempre del `TenantGuard`/sesión;
 * el body nunca lleva un `businessId` propio, así que no hay forma de que
 * el chatbot consulte datos de otro negocio.
 */
@Controller('insights/chatbot')
@UseGuards(JwtGuard, TenantGuard)
export class ChatbotController {
  constructor(private readonly chatbot: ChatbotService) {}

  @Post('message')
  @HttpCode(200)
  sendMessage(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ChatbotMessageDto,
  ) {
    return this.chatbot.handleMessage(req.currentBusinessId!, dto.message);
  }

  /** Chips iniciales — respuesta fija, no llama a IA. */
  @Get('suggested-questions')
  suggestedQuestions() {
    return SUGGESTED_QUESTION_IDS.map((id) => {
      const entry = findHelpFaqEntry(id)!;
      return { id: entry.id, question: entry.question };
    });
  }
}
