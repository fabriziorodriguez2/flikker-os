import { GoogleOAuthClient } from './google-oauth.client';

describe('GoogleOAuthClient', () => {
  const env = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = 'client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'client-secret';
    process.env.GOOGLE_OAUTH_REDIRECT_URI =
      'https://flikker.site/api/auth/google/callback';
  });

  afterEach(() => {
    process.env = { ...env };
    global.fetch = originalFetch;
  });

  it('URL de autorización: code flow, SOLO openid/email/profile, PKCE S256, state y nonce', () => {
    const url = new URL(
      new GoogleOAuthClient().buildAuthorizationUrl({
        state: 'the-state',
        nonce: 'the-nonce',
        codeChallenge: 'the-challenge',
      }),
    );

    expect(url.origin + url.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: 'client-id',
      redirect_uri: 'https://flikker.site/api/auth/google/callback',
      scope: 'openid email profile',
      state: 'the-state',
      nonce: 'the-nonce',
      code_challenge: 'the-challenge',
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
    // Nunca el client secret en una URL que ve el browser.
    expect(url.toString()).not.toContain('client-secret');
  });

  it('isConfigured exige client id, secret y redirect URI', () => {
    expect(new GoogleOAuthClient().isConfigured()).toBe(true);
    delete process.env.GOOGLE_OAUTH_REDIRECT_URI;
    expect(new GoogleOAuthClient().isConfigured()).toBe(false);
  });

  it('canje: manda verifier + mismo redirect URI y devuelve SOLO el id_token', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'google-access',
          id_token: 'google-id-token',
        }),
        { status: 200 },
      ),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const idToken = await new GoogleOAuthClient().exchangeCodeForIdToken({
      code: 'the-code',
      codeVerifier: 'the-verifier',
    });

    expect(idToken).toBe('google-id-token');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = new URLSearchParams(init.body as string);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code_verifier')).toBe('the-verifier');
    expect(body.get('redirect_uri')).toBe(
      'https://flikker.site/api/auth/google/callback',
    );
  });

  it('code inválido (400 de Google) → GoogleAuthError', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'invalid_grant' }), {
        status: 400,
      }),
    ) as unknown as typeof fetch;

    await expect(
      new GoogleOAuthClient().exchangeCodeForIdToken({
        code: 'bad',
        codeVerifier: 'v',
      }),
    ).rejects.toThrow('token_exchange_failed');
  });
});
