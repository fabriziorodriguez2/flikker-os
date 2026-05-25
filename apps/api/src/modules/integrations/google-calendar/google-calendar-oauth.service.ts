import { Injectable, Logger } from '@nestjs/common';
import { buildOAuthState } from '../../../common/utils/calendar-crypto.util';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
}

@Injectable()
export class GoogleCalendarOAuthService {
  private readonly logger = new Logger(GoogleCalendarOAuthService.name);

  private get clientId(): string {
    return process.env.GOOGLE_CLIENT_ID ?? '';
  }

  private get clientSecret(): string {
    return process.env.GOOGLE_CLIENT_SECRET ?? '';
  }

  private get redirectUri(): string {
    return process.env.GOOGLE_CALENDAR_REDIRECT_URI ?? '';
  }

  buildAuthUrl(businessId: string): string {
    const state = buildOAuthState(businessId);
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<TokenSet> {
    const res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });

    if (!res.ok) {
      const body = await res.text();
      this.logger.error(`Token exchange failed: ${body}`);
      throw new Error('Failed to exchange authorization code');
    }

    return this.parseTokenResponse(await res.json());
  }

  async refreshAccessToken(refreshToken: string): Promise<TokenSet> {
    const res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'refresh_token',
      }).toString(),
    });

    if (!res.ok) {
      const body = await res.text();
      this.logger.error(`Token refresh failed: ${body}`);
      throw new Error('Failed to refresh access token');
    }

    const data = await res.json();
    return this.parseTokenResponse({ ...data, refresh_token: refreshToken });
  }

  async revokeToken(token: string): Promise<void> {
    const res = await fetch(
      `${REVOKE_ENDPOINT}?token=${encodeURIComponent(token)}`,
      { method: 'POST' },
    );
    if (!res.ok) {
      this.logger.warn(`Token revoke returned ${res.status}`);
    }
  }

  private parseTokenResponse(data: Record<string, unknown>): TokenSet {
    const expiresIn = (data.expires_in as number | undefined) ?? 3600;
    return {
      accessToken: data.access_token as string,
      refreshToken: (data.refresh_token as string | undefined) ?? null,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    };
  }
}
