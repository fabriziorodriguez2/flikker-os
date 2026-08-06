import { randomInt } from 'crypto';

/**
 * Same unambiguous alphabet (no 0/O/1/I/L) already used by
 * `BenefitsRepository` and `IncentiveIssuerService` for redemption codes.
 * Extracted here for new callers (Reward Goals) rather than copied a third
 * time — the two existing call sites are left as-is; this is additive, not a
 * refactor of working code.
 */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateRedemptionCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  }
  return code;
}
