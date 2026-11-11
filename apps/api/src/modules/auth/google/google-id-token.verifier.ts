import { createPublicKey, type JsonWebKey } from 'crypto';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { GoogleAuthError } from './google-auth.error';

const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS: [string, string] = [
  'https://accounts.google.com',
  'accounts.google.com',
];
/** Fallback si Google no manda `Cache-Control: max-age`. */
const DEFAULT_JWKS_TTL_MS = 60 * 60 * 1000;

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  givenName: string | null;
  familyName: string | null;
}

interface GoogleIdTokenPayload {
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
  nonce?: unknown;
  name?: unknown;
  given_name?: unknown;
  family_name?: unknown;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Verificación real del ID token de Google: firma RS256 contra las JWKS
 * públicas de Google, `iss`, `aud` (= nuestro client id), `exp` y `nonce`.
 *
 * Usa jsonwebtoken (vía `@nestjs/jwt`, ya en el repo) para la verificación;
 * lo único propio es traer y cachear las claves públicas.
 */
@Injectable()
export class GoogleIdTokenVerifier {
  private keys = new Map<string, string>();
  private keysExpireAt = 0;

  constructor(private readonly jwt: JwtService) {}

  async verify(
    idToken: string,
    expected: { audience: string; nonce: string },
  ): Promise<GoogleIdentity> {
    if (!expected.audience) throw new GoogleAuthError('missing_audience');

    const decoded = this.jwt.decode<{
      header?: { kid?: unknown; alg?: unknown };
    } | null>(idToken, { complete: true });
    const kid = decoded?.header?.kid;
    if (typeof kid !== 'string' || decoded?.header?.alg !== 'RS256') {
      throw new GoogleAuthError('malformed_id_token');
    }

    const publicKey = await this.getPublicKey(kid);

    let payload: GoogleIdTokenPayload;
    try {
      payload = this.jwt.verify<GoogleIdTokenPayload & object>(idToken, {
        publicKey,
        algorithms: ['RS256'],
        audience: expected.audience,
        issuer: GOOGLE_ISSUERS,
      });
    } catch {
      // Firma, aud, iss o exp inválidos — el detalle no sale de acá.
      throw new GoogleAuthError('invalid_id_token');
    }

    if (!expected.nonce || payload.nonce !== expected.nonce) {
      throw new GoogleAuthError('nonce_mismatch');
    }

    const sub = optionalString(payload.sub);
    if (!sub) throw new GoogleAuthError('missing_sub');

    const email = optionalString(payload.email);
    if (!email) throw new GoogleAuthError('missing_email');

    return {
      sub,
      email,
      emailVerified: payload.email_verified === true,
      name: optionalString(payload.name),
      givenName: optionalString(payload.given_name),
      familyName: optionalString(payload.family_name),
    };
  }

  private async getPublicKey(kid: string): Promise<string> {
    const cached =
      Date.now() < this.keysExpireAt ? this.keys.get(kid) : undefined;
    if (cached) return cached;

    // Kid desconocido o caché vencida: Google rota claves, se refresca una vez.
    await this.refreshKeys();
    const fresh = this.keys.get(kid);
    if (!fresh) throw new GoogleAuthError('unknown_kid');
    return fresh;
  }

  private async refreshKeys(): Promise<void> {
    let res: Response;
    try {
      res = await fetch(JWKS_URL);
    } catch {
      throw new GoogleAuthError('jwks_network');
    }
    if (!res.ok) throw new GoogleAuthError('jwks_failed');

    const body = (await res.json().catch(() => null)) as {
      keys?: (JsonWebKey & { kid?: string })[];
    } | null;

    const keys = new Map<string, string>();
    for (const jwk of body?.keys ?? []) {
      if (!jwk.kid || jwk.kty !== 'RSA') continue;
      try {
        const pem = createPublicKey({ key: jwk, format: 'jwk' })
          .export({ type: 'spki', format: 'pem' })
          .toString();
        keys.set(jwk.kid, pem);
      } catch {
        // Clave malformada: se ignora, no tumba al resto.
      }
    }

    const maxAge = /max-age=(\d+)/.exec(
      res.headers.get('cache-control') ?? '',
    )?.[1];
    this.keys = keys;
    this.keysExpireAt =
      Date.now() + (maxAge ? Number(maxAge) * 1000 : DEFAULT_JWKS_TTL_MS);
  }
}
