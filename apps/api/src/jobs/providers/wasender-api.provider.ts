import { Logger } from '@nestjs/common';
import {
  SendTextInput,
  SendTextResult,
  WhatsAppProvider,
  WhatsAppProviderError,
} from '../whatsapp-provider';

/**
 * WaSenderAPI — confirmado contra la documentación oficial vigente
 * (wasenderapi.com/api-docs) antes de implementar, no copiado a ciegas del
 * ejemplo de la consigna:
 *
 *   POST /api/send-message  — Authorization: Bearer <key>, {to, text}
 *     → 200 {success:true, data:{msgId, jid, status:"in_progress"}}
 *     → error {success:false, message, errors?}
 *   GET  /api/status        — Authorization: Bearer <key>
 *     → {status: "connected"|"connecting"|"disconnected"|"need_scan"|
 *                "need_passkey"|"logged_out"|"expired"}
 *
 * `status: "in_progress"` en la respuesta de envío es exactamente el caso
 * que la consigna pide NO filtrar al dominio — acá se normaliza a
 * `'accepted'` (el proveedor lo tomó), nunca a un estado de `MessageStatus`.
 */
const DEFAULT_BASE_URL = 'https://www.wasenderapi.com';
const SEND_TIMEOUT_MS = 10_000;
const STATUS_TIMEOUT_MS = 5_000;
/**
 * §9 — nunca se llama a WaSender en cada render del dashboard. El resultado
 * de sesión se cachea en memoria del proceso; 60s balancea "un cambio de
 * sesión se refleja rápido" contra "no golpear el endpoint en cada request
 * de Notificaciones/dispatch".
 */
const SESSION_STATUS_CACHE_TTL_MS = 60_000;

interface CachedAvailability {
  value: boolean;
  expiresAt: number;
}

export class WaSenderApiProvider implements WhatsAppProvider {
  readonly name = 'wasender';
  private readonly logger = new Logger(WaSenderApiProvider.name);
  private cached: CachedAvailability | null = null;

  private get baseUrl(): string {
    return (process.env.WASENDER_BASE_URL ?? DEFAULT_BASE_URL).replace(
      /\/$/,
      '',
    );
  }

  private get apiKey(): string | undefined {
    return process.env.WASENDER_API_KEY;
  }

  /**
   * Mínimo garantizado: la key está configurada. Si además se puede
   * consultar la sesión sin costo relevante, esa lectura manda — una key
   * presente con la sesión desconectada NO debe leerse como "mensajería
   * disponible" (pedido explícito, §9).
   */
  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) return false;

    const now = Date.now();
    if (this.cached && this.cached.expiresAt > now) {
      return this.cached.value;
    }

    const connected = await this.checkSessionConnected();
    this.cached = {
      value: connected,
      expiresAt: now + SESSION_STATUS_CACHE_TTL_MS,
    };
    return connected;
  }

  /**
   * Nunca lanza — si el chequeo de sesión falla (red, timeout, respuesta
   * rara), el canal se lee como no disponible en vez de romper el dashboard
   * o el gate del dispatcher. Se loggea sin exponer la key.
   */
  private async checkSessionConnected(): Promise<boolean> {
    try {
      const response = await this.fetchWithTimeout(
        `${this.baseUrl}/api/status`,
        { method: 'GET', headers: this.authHeaders() },
        STATUS_TIMEOUT_MS,
      );
      if (!response.ok) return false;
      const payload = (await response.json().catch(() => null)) as unknown;
      const status = isRecord(payload) ? stringValue(payload.status) : null;
      return status === 'connected';
    } catch (error) {
      this.logger.warn(
        `WaSenderAPI session status check failed: ${errorMessage(error)}`,
      );
      return false;
    }
  }

  async sendText(input: SendTextInput): Promise<SendTextResult> {
    const key = this.apiKey;
    if (!key) {
      throw new WhatsAppProviderError(
        'WASENDER_API_KEY is required to send WhatsApp messages',
      );
    }

    let response: Response;
    try {
      response = await this.fetchWithTimeout(
        `${this.baseUrl}/api/send-message`,
        {
          method: 'POST',
          headers: {
            ...this.authHeaders(),
            'Content-Type': 'application/json',
          },
          // `to` viaja tal cual llega — ya es E.164 con `+` (ver
          // `## Phone normalization`), que es exactamente lo que pide la
          // documentación de WaSenderAPI. Ningún ajuste de formato acá.
          body: JSON.stringify({ to: input.to, text: input.text }),
        },
        SEND_TIMEOUT_MS,
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new WhatsAppProviderError('WaSenderAPI request timed out');
      }
      throw new WhatsAppProviderError(
        `WaSenderAPI request failed: ${errorMessage(error)}`,
      );
    }

    const payload = (await response.json().catch(() => null)) as unknown;

    if (!response.ok) {
      throw new WhatsAppProviderError(
        `WaSenderAPI send failed: ${sanitizedErrorMessage(payload)}`,
        response.status,
        errorCode(payload),
      );
    }

    const data = isRecord(payload) ? payload.data : null;
    const msgId = isRecord(data)
      ? (stringValue(data.msgId) ?? numberAsString(data.msgId))
      : null;
    if (!msgId) {
      throw new WhatsAppProviderError(
        'WaSenderAPI accepted the request but returned no message id',
      );
    }

    return { providerMessageId: msgId, status: 'accepted' };
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.apiKey}` };
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
}

function sanitizedErrorMessage(payload: unknown): string {
  if (isRecord(payload) && typeof payload.message === 'string') {
    return payload.message.slice(0, 300);
  }
  const text = JSON.stringify(payload);
  return text ? text.slice(0, 300) : 'unknown error';
}

function errorCode(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined;
  return stringValue(payload.code) ?? undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberAsString(value: unknown): string | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? String(value)
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
