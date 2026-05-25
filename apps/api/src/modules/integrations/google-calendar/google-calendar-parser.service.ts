import { Injectable } from '@nestjs/common';

// UY phone patterns (mobile 09XXXXXXX, or with country code +5989XXXXXXX)
// Also matches 8-digit landlines starting with 2-9 (Montevideo, interior)
const PHONE_RE =
  /(?:\+598[\s.\-]?)?(?:0?9\d[\s.\-]?\d{3}[\s.\-]?\d{3}|[2-9]\d{3}[\s.\-]?\d{4})/g;

// Separators between name and phone in title
const SEPARATOR_RE = /[\s.\-–—|,;:()[\]{}]+/g;

export interface ParsedEvent {
  customerName: string | null;
  customerPhone: string | null;
}

@Injectable()
export class GoogleCalendarParserService {
  parse(title: string): ParsedEvent {
    const raw = title.trim();
    const phoneMatches = [...raw.matchAll(PHONE_RE)];

    if (phoneMatches.length === 0) {
      const name = cleanName(raw);
      return { customerName: name || null, customerPhone: null };
    }

    const firstMatch = phoneMatches[0];
    const rawPhone = firstMatch[0];
    const phoneStart = firstMatch.index!;
    const phoneEnd = phoneStart + rawPhone.length;

    // Name is everything outside the phone match, stripped of separators
    const before = raw.slice(0, phoneStart).replace(SEPARATOR_RE, ' ').trim();
    const after = raw.slice(phoneEnd).replace(SEPARATOR_RE, ' ').trim();
    const namePart = [before, after].filter(Boolean).join(' ').trim();
    const name = cleanName(namePart);

    const phone = rawPhone.replace(/[\s.\-]/g, '');

    return {
      customerName: name || null,
      customerPhone: phone || null,
    };
  }
}

function cleanName(raw: string): string {
  return raw
    .replace(/^[\s.\-–—|,;:()[\]{}]+/, '')
    .replace(/[\s.\-–—|,;:()[\]{}]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
