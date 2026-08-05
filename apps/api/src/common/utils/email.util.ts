import { BadRequestException } from '@nestjs/common';

/**
 * Practical email shape: a local part, a domain, and a real TLD of 2+ letters.
 *
 * Deliberately stricter than the browser's `type="email"`, which accepts
 * TLD-less values such as `usuario@gmail` — that gap is how accounts were
 * created with a domain missing its `.com`.
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[A-Za-z]{2,}$/;

const MAX_EMAIL_LENGTH = 254;

/** Canonical storage form: trimmed and lowercased. Does not validate. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  return normalized.length <= MAX_EMAIL_LENGTH && EMAIL_REGEX.test(normalized);
}

/**
 * Normalizes and validates an email for persistence. Throws
 * BadRequestException on anything malformed, mirroring `normalizeToE164`.
 */
export function parseEmail(email: string | undefined | null): string {
  const normalized = normalizeEmail(email ?? '');
  if (!normalized) {
    throw new BadRequestException('El email es obligatorio');
  }
  if (!isValidEmail(normalized)) {
    throw new BadRequestException(
      'El email no tiene un formato válido (ej: nombre@dominio.com)',
    );
  }
  return normalized;
}
