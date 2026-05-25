import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

function getKey(): Buffer {
  const hex = process.env.CALENDAR_ENCRYPTION_KEY ?? '';
  if (hex.length !== 64) {
    throw new Error(
      'CALENDAR_ENCRYPTION_KEY must be 64 hex characters (32 bytes)',
    );
  }
  return Buffer.from(hex, 'hex');
}

export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  // format: iv(12B) + tag(16B) + ciphertext — all hex-encoded
  return iv.toString('hex') + tag.toString('hex') + encrypted.toString('hex');
}

export function decryptToken(encoded: string): string {
  const key = getKey();
  const iv = Buffer.from(encoded.slice(0, IV_BYTES * 2), 'hex');
  const tag = Buffer.from(
    encoded.slice(IV_BYTES * 2, (IV_BYTES + TAG_BYTES) * 2),
    'hex',
  );
  const ciphertext = Buffer.from(encoded.slice((IV_BYTES + TAG_BYTES) * 2), 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8');
}

export function signState(payload: string): string {
  const secret = process.env.CALENDAR_ENCRYPTION_KEY ?? 'default-insecure';
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function buildOAuthState(businessId: string): string {
  const ts = Date.now().toString();
  const payload = `${businessId}:${ts}`;
  const sig = signState(payload);
  return Buffer.from(`${payload}:${sig}`).toString('base64url');
}

export function verifyOAuthState(
  state: string,
  maxAgeMs = 15 * 60 * 1000,
): { businessId: string } | null {
  try {
    const decoded = Buffer.from(state, 'base64url').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length < 3) return null;
    const sig = parts.pop()!;
    const ts = parts.pop()!;
    const businessId = parts.join(':');
    const payload = `${businessId}:${ts}`;
    const expected = signState(payload);
    if (sig !== expected) return null;
    if (Date.now() - Number(ts) > maxAgeMs) return null;
    return { businessId };
  } catch {
    return null;
  }
}
