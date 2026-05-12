import { MessageStatus } from '@prisma/client';
import { WhatsAppWebhookService } from './whatsapp-webhook.service';

describe('WhatsAppWebhookService', () => {
  const enqueue = jest.fn();
  const updateMany = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function service() {
    return new WhatsAppWebhookService(
      { message: { updateMany } } as never,
      { enqueue } as never,
    );
  }

  it('enqueues incoming Whapi text messages from the root messages array', async () => {
    await service().handleWebhook({
      messages: [
        {
          id: 'msg-1',
          from_me: false,
          type: 'text',
          chat_id: '59899123456@s.whatsapp.net',
          timestamp: 1712995245,
          text: { body: 'Atendido: Maria 099123456' },
          from: '59899123456',
        },
      ],
      event: { type: 'messages', event: 'post' },
      channel_id: 'channel-1',
    });

    expect(enqueue).toHaveBeenCalledWith({
      from: '59899123456',
      text: 'Atendido: Maria 099123456',
      messageId: 'msg-1',
      receivedAt: new Date(1712995245 * 1000).toISOString(),
    });
  });

  it('updates message status from Whapi statuses payload', async () => {
    await service().handleWebhook({
      statuses: [
        {
          id: 'whapi-msg-1',
          status: 'read',
          timestamp: '1712995290',
        },
      ],
      event: { type: 'statuses', event: 'post' },
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: { whatsappMsgId: 'whapi-msg-1' },
      data: {
        status: MessageStatus.read,
        readAt: new Date(1712995290 * 1000),
      },
    });
  });
});
