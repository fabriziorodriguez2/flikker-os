import { WhapiProvider } from './providers/whapi.provider';
import { WaSenderApiProvider } from './providers/wasender-api.provider';
import type { WhatsAppProvider } from './whatsapp-provider';

/**
 * §15 — feature flag de cutover. `WhatsAppBspService` (que ya vive como
 * instancia propia, sin dependencias, en cada módulo que lo registra — ver
 * jobs.module.ts/retention-v2.module.ts/public.module.ts/customers.module.ts)
 * llama a esto en vez de recibir el provider por DI, para no tener que tocar
 * esos cuatro registros ni introducir un nuevo token inyectable.
 *
 * Default `whapi`: desplegar este cambio sin tocar variables de entorno en
 * Railway no altera el comportamiento — el cutover real es explícito,
 * flippeando `WHATSAPP_PROVIDER=wasender` (Fase 2, ver `## Feature
 * flag/cutover`).
 *
 * Los dos adapters son stateless salvo el cache de sesión de WaSenderAPI
 * (§9) — por eso se memoiza una sola instancia por tipo, no una por request.
 */
let whapiInstance: WhatsAppProvider | null = null;
let wasenderInstance: WhatsAppProvider | null = null;

export function getWhatsAppProvider(): WhatsAppProvider {
  const selected = (process.env.WHATSAPP_PROVIDER ?? 'whapi')
    .trim()
    .toLowerCase();

  if (selected === 'wasender') {
    if (!wasenderInstance) wasenderInstance = new WaSenderApiProvider();
    return wasenderInstance;
  }

  if (!whapiInstance) whapiInstance = new WhapiProvider();
  return whapiInstance;
}

/** Solo para tests — fuerza que la próxima llamada reconstruya el provider. */
export function resetWhatsAppProviderCache() {
  whapiInstance = null;
  wasenderInstance = null;
}
