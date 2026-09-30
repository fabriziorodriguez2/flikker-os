import { createHmac } from 'crypto';
import {
  buildMercadoPagoSignatureManifest,
  isValidMercadoPagoSignature,
  parseMercadoPagoSignatureHeader,
} from './mercado-pago-webhook-security';

/**
 * Verificación de firma de Mercado Pago — confirmada contra la
 * documentación oficial (your-integrations/notifications/webhooks), no
 * asumida. Manifest: `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`,
 * HMAC-SHA256 hex, comparación timing-safe contra `v1`.
 */
describe('mercado-pago-webhook-security', () => {
  const SECRET = 'test-webhook-secret';

  function sign(manifest: string, secret = SECRET): string {
    return createHmac('sha256', secret).update(manifest).digest('hex');
  }

  describe('buildMercadoPagoSignatureManifest', () => {
    it('arma el manifest exacto con los tres segmentos', () => {
      const manifest = buildMercadoPagoSignatureManifest({
        dataId: 'ABC123',
        xRequestId: 'req-1',
        ts: '1704908010',
      });
      expect(manifest).toBe('id:abc123;request-id:req-1;ts:1704908010;');
    });

    it('pone el data.id en minúsculas', () => {
      const manifest = buildMercadoPagoSignatureManifest({
        dataId: 'UPPERCASEID',
        xRequestId: 'req-1',
        ts: '1',
      });
      expect(manifest).toContain('id:uppercaseid;');
    });

    it('omite el segmento request-id si x-request-id viene vacío', () => {
      const manifest = buildMercadoPagoSignatureManifest({
        dataId: 'abc123',
        xRequestId: undefined,
        ts: '1704908010',
      });
      expect(manifest).toBe('id:abc123;ts:1704908010;');
      expect(manifest).not.toContain('request-id');
    });
  });

  describe('parseMercadoPagoSignatureHeader', () => {
    it('parsea ts y v1 del formato real', () => {
      expect(
        parseMercadoPagoSignatureHeader('ts=1704908010,v1=abc123'),
      ).toEqual({ ts: '1704908010', v1: 'abc123' });
    });

    it('header ausente: null', () => {
      expect(parseMercadoPagoSignatureHeader(undefined)).toBeNull();
    });

    it('header sin v1: null', () => {
      expect(parseMercadoPagoSignatureHeader('ts=1704908010')).toBeNull();
    });

    it('header vacío: null', () => {
      expect(parseMercadoPagoSignatureHeader('')).toBeNull();
    });
  });

  describe('isValidMercadoPagoSignature', () => {
    it('firma correcta calculada con el secret real: válida', () => {
      const ts = '1704908010';
      const manifest = buildMercadoPagoSignatureManifest({
        dataId: 'abc123',
        xRequestId: 'req-1',
        ts,
      });
      const v1 = sign(manifest);

      expect(
        isValidMercadoPagoSignature({
          xSignature: `ts=${ts},v1=${v1}`,
          xRequestId: 'req-1',
          dataId: 'abc123',
          secret: SECRET,
        }),
      ).toBe(true);
    });

    it('firma calculada con OTRO secret: inválida', () => {
      const ts = '1704908010';
      const manifest = buildMercadoPagoSignatureManifest({
        dataId: 'abc123',
        xRequestId: 'req-1',
        ts,
      });
      const v1 = sign(manifest, 'secret-equivocado');

      expect(
        isValidMercadoPagoSignature({
          xSignature: `ts=${ts},v1=${v1}`,
          xRequestId: 'req-1',
          dataId: 'abc123',
          secret: SECRET,
        }),
      ).toBe(false);
    });

    it('data.id distinto al firmado: inválida', () => {
      const ts = '1704908010';
      const manifest = buildMercadoPagoSignatureManifest({
        dataId: 'abc123',
        xRequestId: 'req-1',
        ts,
      });
      const v1 = sign(manifest);

      expect(
        isValidMercadoPagoSignature({
          xSignature: `ts=${ts},v1=${v1}`,
          xRequestId: 'req-1',
          dataId: 'otro-id-distinto',
          secret: SECRET,
        }),
      ).toBe(false);
    });

    it('x-request-id distinto al firmado: inválida', () => {
      const ts = '1704908010';
      const manifest = buildMercadoPagoSignatureManifest({
        dataId: 'abc123',
        xRequestId: 'req-1',
        ts,
      });
      const v1 = sign(manifest);

      expect(
        isValidMercadoPagoSignature({
          xSignature: `ts=${ts},v1=${v1}`,
          xRequestId: 'req-DISTINTO',
          dataId: 'abc123',
          secret: SECRET,
        }),
      ).toBe(false);
    });

    it('sin secret configurado: inválida (nunca "pasa" por falta de config)', () => {
      const ts = '1704908010';
      const manifest = buildMercadoPagoSignatureManifest({
        dataId: 'abc123',
        xRequestId: 'req-1',
        ts,
      });
      const v1 = sign(manifest);

      expect(
        isValidMercadoPagoSignature({
          xSignature: `ts=${ts},v1=${v1}`,
          xRequestId: 'req-1',
          dataId: 'abc123',
          secret: undefined,
        }),
      ).toBe(false);
    });

    it('sin x-signature: inválida', () => {
      expect(
        isValidMercadoPagoSignature({
          xSignature: undefined,
          xRequestId: 'req-1',
          dataId: 'abc123',
          secret: SECRET,
        }),
      ).toBe(false);
    });

    it('sin data.id: inválida', () => {
      expect(
        isValidMercadoPagoSignature({
          xSignature: 'ts=1,v1=abc',
          xRequestId: 'req-1',
          dataId: undefined,
          secret: SECRET,
        }),
      ).toBe(false);
    });

    it('x-signature con formato basura: inválida, nunca tira', () => {
      expect(
        isValidMercadoPagoSignature({
          xSignature: 'esto-no-es-el-formato-esperado',
          xRequestId: 'req-1',
          dataId: 'abc123',
          secret: SECRET,
        }),
      ).toBe(false);
    });
  });
});
