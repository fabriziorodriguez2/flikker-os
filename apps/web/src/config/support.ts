const DEFAULT_SUPPORT_WHATSAPP = "59891624988";

export const SUPPORT_WHATSAPP_NUMBER =
  process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP?.replace(/\D/g, "") ||
  DEFAULT_SUPPORT_WHATSAPP;

export function supportWhatsAppHref(message: string) {
  return `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
