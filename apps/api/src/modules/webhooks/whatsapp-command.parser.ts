export type WhatsAppBotCommand =
  | {
      type: 'attended';
      raw: string;
      phone: string;
      name?: string;
    }
  | { type: 'stats'; raw: string }
  | { type: 'pause'; raw: string }
  | { type: 'help'; raw: string }
  | { type: 'unknown'; raw: string; reason: string };

const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{6,}\d)/;

export function parseWhatsAppCommand(input: string): WhatsAppBotCommand {
  const raw = input.trim();
  const normalized = normalizeText(raw);

  if (!normalized) {
    return unknown(raw, 'empty');
  }

  if (/^(stats|estadisticas|metricas)\b/.test(normalized)) {
    return { type: 'stats', raw };
  }

  if (/^(pausar|pausa|pause)\b/.test(normalized)) {
    return { type: 'pause', raw };
  }

  if (/^(ayuda|help|comandos)\b/.test(normalized)) {
    return { type: 'help', raw };
  }

  if (!/^(atendido|atendi|atendi a)\b/.test(normalized)) {
    return unknown(raw, 'unsupported_command');
  }

  const withoutCommand = raw
    .replace(/^\s*atendido\s*:?\s*/i, '')
    .replace(/^\s*atend[i\u00ed]\s+a\s*/i, '')
    .replace(/^\s*atend[i\u00ed]\s*/i, '')
    .trim();
  const phoneMatch = withoutCommand.match(PHONE_PATTERN);

  if (!phoneMatch) {
    return unknown(raw, 'missing_phone');
  }

  const phone = phoneMatch[0].trim();
  const name = withoutCommand
    .replace(phoneMatch[0], '')
    .replace(/[:,-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    type: 'attended',
    raw,
    phone,
    name: name || undefined,
  };
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function unknown(raw: string, reason: string): WhatsAppBotCommand {
  return { type: 'unknown', raw, reason };
}

export const WHATSAPP_HELP_TEXT =
  'Comandos: Atendido: Nombre 099123456 | Stats | Pausar | Ayuda';

export const WHATSAPP_PARSE_ERROR_TEXT =
  'No pude entender el mensaje. Ejemplo: Atendido: Maria Garcia 099887766';
