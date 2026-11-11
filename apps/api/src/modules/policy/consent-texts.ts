import { ConsentChannel } from '@prisma/client';

/**
 * Textos de consentimiento que ve el cliente, por canal. El servidor los
 * arma y los devuelve a la pantalla: así el texto que se muestra y la versión
 * que se guarda con el sí siempre coinciden. Cambiar un texto = subir su
 * versión (los consentimientos viejos conservan la suya).
 */
export const CONSENT_TEXT_VERSIONS: Record<ConsentChannel, string> = {
  WHATSAPP: 'whatsapp-marketing-v2',
  EMAIL: 'email-marketing-v1',
};

export function consentText(
  channel: ConsentChannel,
  businessName: string,
): string {
  const name = businessName.trim() || 'este local';
  return channel === ConsentChannel.WHATSAPP
    ? `Quiero recibir promociones y beneficios de ${name} por WhatsApp. Puedo darme de baja cuando quiera respondiendo BAJA.`
    : `Quiero recibir promociones y beneficios de ${name} por email. Puedo darme de baja cuando quiera.`;
}
