import { Injectable, Logger } from '@nestjs/common';
import { GoogleAuthError } from './google-auth.error';

const AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/** Solo identidad. Nunca pedir scopes de APIs de Google (Drive, Calendar, …). */
const SCOPE = 'openid email profile';

/**
 * "Continuar con Google" — Authorization Code + PKCE contra Google.
 *
 * Comparte `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` con la integración de
 * Google Calendar (mismo OAuth client), pero con su propio redirect URI:
 * `GOOGLE_OAUTH_REDIRECT_URI` apunta al callback de la WEB
 * (`/api/auth/google/callback`), que es quien tiene la cookie de sesión.
 * Esta clase es la única que conoce el redirect URI, así que la URL de
 * autorización y el canje del code usan siempre el mismo valor exacto.
 */
@Injectable()
export class GoogleOAuthClient {
  private readonly logger = new Logger(GoogleOAuthClient.name);

  get clientId(): string {
    return process.env.GOOGLE_CLIENT_ID ?? '';
  }

  private get clientSecret(): string {
    return process.env.GOOGLE_CLIENT_SECRET ?? '';
  }

  private get redirectUri(): string {
    return process.env.GOOGLE_OAUTH_REDIRECT_URI ?? '';
  }

  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret && this.redirectUri);
  }

  buildAuthorizationUrl(input: {
    state: string;
    nonce: string;
    codeChallenge: string;
  }): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: SCOPE,
      state: input.state,
      nonce: input.nonce,
      code_challenge: input.codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
    return `${AUTHORIZATION_ENDPOINT}?${params.toString()}`;
  }

  /**
   * Canjea el code y devuelve SOLO el ID token. El access_token (y un
   * eventual refresh_token) se descartan: no usamos ninguna API de Google.
   * Nunca se loguea el body de la respuesta — puede traer tokens.
   */
  async exchangeCodeForIdToken(input: {
    code: string;
    codeVerifier: string;
  }): Promise<string> {
    let res: Response;
    try {
      res = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: input.code,
          code_verifier: input.codeVerifier,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          redirect_uri: this.redirectUri,
        }).toString(),
      });
    } catch {
      throw new GoogleAuthError('token_exchange_network');
    }

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: unknown;
      } | null;
      const errorCode =
        typeof body?.error === 'string' ? body.error : 'unknown';
      this.logger.warn(
        `Google token exchange failed: status=${res.status} error=${errorCode}`,
      );
      throw new GoogleAuthError('token_exchange_failed');
    }

    const data = (await res.json().catch(() => null)) as {
      id_token?: unknown;
    } | null;
    if (typeof data?.id_token !== 'string' || !data.id_token) {
      throw new GoogleAuthError('missing_id_token');
    }
    return data.id_token;
  }
}
