import { Body, Controller, HttpCode, Logger, Post } from '@nestjs/common';
import { WhatsAppWebhookService } from './whatsapp-webhook.service';

@Controller('webhooks')
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);

  constructor(private readonly webhookService: WhatsAppWebhookService) {}

  @Post('whatsapp')
  @HttpCode(200)
  receive(@Body() body: Record<string, unknown>) {
    void this.webhookService.handleWebhook(body).catch((error: unknown) => {
      this.logger.error(
        'WhatsApp webhook async handling failed',
        error instanceof Error ? error.stack : String(error),
      );
    });
    return { ok: true };
  }
}
