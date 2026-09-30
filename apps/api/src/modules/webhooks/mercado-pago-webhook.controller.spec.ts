import { createHmac } from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import { MercadoPagoWebhookController } from './mercado-pago-webhook.controller';
import { MercadoPagoWebhookService } from './mercado-pago-webhook.service';

/**
 * Contrato del endpoint: firma inválida/ausente NUNCA llega a tocar el
 * service (ni MP ni la base) — se verifica acá con un mock que hace
 * `toHaveBeenCalled()`, no con Postgres real (ese nivel lo cubre
 * `mercado-pago-webhook.service.spec.ts`).
 */
describe('MercadoPagoWebhookController', () => {
  const SECRET = 'test-webhook-secret';
  const ORIGINAL_SECRET = process.env.MERCADO_PAGO_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.MERCADO_PAGO_WEBHOOK_SECRET = SECRET;
  });

  afterEach(() => {
    process.env.MERCADO_PAGO_WEBHOOK_SECRET = ORIGINAL_SECRET;
  });

  function makeService() {
    return {
      handleSubscriptionPreapproval: jest.fn().mockResolvedValue(undefined),
      handleSubscriptionAuthorizedPayment: jest
        .fn()
        .mockResolvedValue(undefined),
    };
  }

  function makeController(service: ReturnType<typeof makeService>) {
    return new MercadoPagoWebhookController(
      service as unknown as MercadoPagoWebhookService,
    );
  }

  function signedHeaders(dataId: string, xRequestId = 'req-1') {
    const ts = '1704908010';
    const manifest = `id:${dataId.toLowerCase()};request-id:${xRequestId};ts:${ts};`;
    const v1 = createHmac('sha256', SECRET).update(manifest).digest('hex');
    return { xSignature: `ts=${ts},v1=${v1}`, xRequestId };
  }

  describe('firma', () => {
    it('válida → procesa (llama al service)', async () => {
      const service = makeService();
      const controller = makeController(service);
      const { xSignature, xRequestId } = signedHeaders('sub-123');

      await controller.receive(xSignature, xRequestId, 'sub-123', {
        type: 'subscription_preapproval',
        data: { id: 'sub-123' },
      });

      expect(service.handleSubscriptionPreapproval).toHaveBeenCalledWith(
        'sub-123',
      );
    });

    it('inválida → 401, nunca llama al service', async () => {
      const service = makeService();
      const controller = makeController(service);

      await expect(
        controller.receive('ts=1,v1=firma-incorrecta', 'req-1', 'sub-123', {
          type: 'subscription_preapproval',
          data: { id: 'sub-123' },
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(service.handleSubscriptionPreapproval).not.toHaveBeenCalled();
      expect(
        service.handleSubscriptionAuthorizedPayment,
      ).not.toHaveBeenCalled();
    });

    it('ausente (sin x-signature) → 401, nunca llama al service', async () => {
      const service = makeService();
      const controller = makeController(service);

      await expect(
        controller.receive(undefined, 'req-1', 'sub-123', {
          type: 'subscription_preapproval',
          data: { id: 'sub-123' },
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(service.handleSubscriptionPreapproval).not.toHaveBeenCalled();
    });

    it('sin MERCADO_PAGO_WEBHOOK_SECRET configurado → 401, nunca llama al service', async () => {
      delete process.env.MERCADO_PAGO_WEBHOOK_SECRET;
      const service = makeService();
      const controller = makeController(service);
      const { xSignature, xRequestId } = signedHeaders('sub-123');

      await expect(
        controller.receive(xSignature, xRequestId, 'sub-123', {
          type: 'subscription_preapproval',
          data: { id: 'sub-123' },
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(service.handleSubscriptionPreapproval).not.toHaveBeenCalled();
    });
  });

  describe('dispatch por topic', () => {
    it('subscription_preapproval → handleSubscriptionPreapproval', async () => {
      const service = makeService();
      const controller = makeController(service);
      const { xSignature, xRequestId } = signedHeaders('sub-123');

      await controller.receive(xSignature, xRequestId, 'sub-123', {
        type: 'subscription_preapproval',
        data: { id: 'sub-123' },
      });

      expect(service.handleSubscriptionPreapproval).toHaveBeenCalledWith(
        'sub-123',
      );
      expect(
        service.handleSubscriptionAuthorizedPayment,
      ).not.toHaveBeenCalled();
    });

    it('subscription_authorized_payment → handleSubscriptionAuthorizedPayment', async () => {
      const service = makeService();
      const controller = makeController(service);
      const { xSignature, xRequestId } = signedHeaders('pay-456');

      await controller.receive(xSignature, xRequestId, 'pay-456', {
        type: 'subscription_authorized_payment',
        data: { id: 'pay-456' },
      });

      expect(service.handleSubscriptionAuthorizedPayment).toHaveBeenCalledWith(
        'pay-456',
      );
      expect(service.handleSubscriptionPreapproval).not.toHaveBeenCalled();
    });

    it('topic "payment" (no manejado): 200 implícito, no llama a ningún handler', async () => {
      const service = makeService();
      const controller = makeController(service);
      const { xSignature, xRequestId } = signedHeaders('pay-999');

      const result = await controller.receive(
        xSignature,
        xRequestId,
        'pay-999',
        { type: 'payment', data: { id: 'pay-999' } },
      );

      expect(result).toEqual({ ok: true });
      expect(service.handleSubscriptionPreapproval).not.toHaveBeenCalled();
      expect(
        service.handleSubscriptionAuthorizedPayment,
      ).not.toHaveBeenCalled();
    });

    it('topic desconocido: 200 implícito, no llama a ningún handler', async () => {
      const service = makeService();
      const controller = makeController(service);
      const { xSignature, xRequestId } = signedHeaders('x-1');

      const result = await controller.receive(xSignature, xRequestId, 'x-1', {
        type: 'algo_que_no_conocemos',
        data: { id: 'x-1' },
      });

      expect(result).toEqual({ ok: true });
      expect(service.handleSubscriptionPreapproval).not.toHaveBeenCalled();
    });

    it('sin data.id en la query: la firma no puede validarse (MP siempre lo manda) → 401, no llama a ningún handler', async () => {
      const service = makeService();
      const controller = makeController(service);

      await expect(
        controller.receive(undefined, undefined, undefined, {
          type: 'subscription_preapproval',
          data: {},
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(service.handleSubscriptionPreapproval).not.toHaveBeenCalled();
    });
  });
});
