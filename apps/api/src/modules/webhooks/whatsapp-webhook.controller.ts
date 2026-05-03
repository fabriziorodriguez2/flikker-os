import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { WhatsAppWebhookService } from './whatsapp-webhook.service';

@Controller('webhooks')
export class WhatsAppWebhookController {
  constructor(private readonly webhookService: WhatsAppWebhookService) {}

  @Post('whatsapp')
  @HttpCode(200)
  receive(@Body() body: Record<string, unknown>) {
    void this.webhookService.handleWebhook(body);
    return { ok: true };
  }
}
