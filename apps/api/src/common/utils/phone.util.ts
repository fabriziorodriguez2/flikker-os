import { BadRequestException } from '@nestjs/common';

export function normalizeToE164(phone: string, countryCode = '598'): string {
  const raw = phone.trim();
  if (!raw) throw new BadRequestException('Phone is required');

  let normalized: string;

  if (raw.startsWith('+')) {
    normalized = `+${raw.slice(1).replace(/\D/g, '')}`;
  } else {
    let national = raw.replace(/\D/g, '');
    if (countryCode === '598' && national.startsWith('0')) {
      national = national.replace(/^0+/, '');
    }
    normalized = `+${countryCode}${national}`;
  }

  const digits = normalized.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) {
    throw new BadRequestException('Phone must have between 8 and 15 digits');
  }

  return normalized;
}
