import { MessageStatus } from '@prisma/client';
import { WaSenderWebhookService } from './wasender-webhook.service';

describe('WaSenderWebhookService', () => {
  const enqueue = jest.fn();
  const updateMany = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function service() {
    return new WaSenderWebhookService(
      { message: { updateMany } } as never,
      { enqueue } as never,
    );
  }

  describe('inbound (messages.upsert / message.received)', () => {
    it('enqueues an inbound text message from messages.upsert', async () => {
      await service().handleEvent({
        event: 'messages.upsert',
        timestamp: 1633456789,
        data: {
          key: {
            id: 'msg-1',
            fromMe: false,
            remoteJid: '59899123456@s.whatsapp.net',
          },
          message: { conversation: 'Atendido: Maria 099123456' },
        },
      });

      expect(enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          from: '59899123456',
          text: 'Atendido: Maria 099123456',
          messageId: 'msg-1',
        }),
      );
    });

    it('enqueues an inbound message from message.received, preferring cleanedSenderPn', async () => {
      await service().handleEvent({
        event: 'message.received',
        data: {
          messages: {
            key: {
              id: '3EB0X123',
              fromMe: false,
              remoteJid: '1234567890@lid',
              senderPn: '1234567890@s.whatsapp.net',
              cleanedSenderPn: '1234567890',
            },
            messageBody: 'ayuda',
          },
        },
      });

      expect(enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ from: '1234567890', text: 'ayuda' }),
      );
    });

    it('never enqueues our own outgoing messages (fromMe: true)', async () => {
      await service().handleEvent({
        event: 'messages.upsert',
        data: {
          key: {
            id: 'msg-1',
            fromMe: true,
            remoteJid: '59899123456@s.whatsapp.net',
          },
          message: { conversation: 'algo que mandamos nosotros' },
        },
      });

      expect(enqueue).not.toHaveBeenCalled();
    });

    it('ignores an inbound event with no extractable text/sender', async () => {
      await service().handleEvent({ event: 'messages.upsert', data: {} });
      expect(enqueue).not.toHaveBeenCalled();
    });
  });

  describe('status updates (messages.update)', () => {
    it('maps status code 2 (SENT) to MessageStatus.sent, correlated by key.id', async () => {
      await service().handleEvent({
        event: 'messages.update',
        data: { key: { id: 'wa-msg-1' }, update: { status: 2 } },
      });

      expect(updateMany).toHaveBeenCalledWith({
        where: { whatsappMsgId: 'wa-msg-1' },
        data: { status: MessageStatus.sent, sentAt: expect.any(Date) },
      });
    });

    it('maps status code 3 (DELIVERED)', async () => {
      await service().handleEvent({
        event: 'messages.update',
        data: { key: { id: 'wa-msg-1' }, update: { status: 3 } },
      });

      expect(updateMany).toHaveBeenCalledWith({
        where: { whatsappMsgId: 'wa-msg-1' },
        data: {
          status: MessageStatus.delivered,
          deliveredAt: expect.any(Date),
        },
      });
    });

    it('maps status code 4 (READ)', async () => {
      await service().handleEvent({
        event: 'messages.update',
        data: { key: { id: 'wa-msg-1' }, update: { status: 4 } },
      });

      expect(updateMany).toHaveBeenCalledWith({
        where: { whatsappMsgId: 'wa-msg-1' },
        data: { status: MessageStatus.read, readAt: expect.any(Date) },
      });
    });

    it('ignores status codes not represented in the domain (0 ERROR, 1 PENDING, 5 PLAYED)', async () => {
      for (const code of [0, 1, 5]) {
        await service().handleEvent({
          event: 'messages.update',
          data: { key: { id: 'wa-msg-1' }, update: { status: code } },
        });
      }
      expect(updateMany).not.toHaveBeenCalled();
    });

    it('does nothing when key.id is missing', async () => {
      await service().handleEvent({
        event: 'messages.update',
        data: { update: { status: 2 } },
      });
      expect(updateMany).not.toHaveBeenCalled();
    });
  });

  describe('unknown / not-yet-used events', () => {
    it.each([
      'message.sent',
      'session.status',
      'group.upsert',
      'call.received',
    ])('ignores %s without throwing', async (event) => {
      await expect(
        service().handleEvent({ event, data: {} }),
      ).resolves.toBeUndefined();
      expect(enqueue).not.toHaveBeenCalled();
      expect(updateMany).not.toHaveBeenCalled();
    });

    it('ignores a payload with no event field', async () => {
      await expect(service().handleEvent({})).resolves.toBeUndefined();
    });
  });
});
