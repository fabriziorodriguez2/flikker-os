import { generateKeyPairSync, type KeyObject } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { GoogleIdTokenVerifier } from './google-id-token.verifier';
import { GoogleAuthError } from './google-auth.error';

/**
 * Verificación REAL: tokens firmados con RS256 por una clave generada en el
 * test, publicada como JWKS a través de un `fetch` mockeado. Nada de la
 * validación (firma, iss, aud, exp, nonce) está mockeada.
 */
const CLIENT_ID = 'flikker-client.apps.googleusercontent.com';
const NONCE = 'n'.repeat(43);
const KID = 'test-kid';

const jwt = new JwtService({});

function makeKeyPair() {
  return generateKeyPairSync('rsa', { modulusLength: 2048 });
}

const googleKeys = makeKeyPair();
const attackerKeys = makeKeyPair();

function jwkFor(publicKey: KeyObject, kid: string) {
  return {
    ...publicKey.export({ format: 'jwk' }),
    kid,
    alg: 'RS256',
    use: 'sig',
  };
}

function sign(
  overrides: Record<string, unknown> = {},
  opts: { privateKey?: KeyObject; expiresIn?: number } = {},
) {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: 'https://accounts.google.com',
      aud: CLIENT_ID,
      sub: '1098765432',
      email: 'mateo@gmail.com',
      email_verified: true,
      name: 'Mateo Gómez',
      given_name: 'Mateo',
      family_name: 'Gómez',
      nonce: NONCE,
      iat: now,
      exp: now + (opts.expiresIn ?? 3600),
      ...overrides,
    },
    {
      privateKey: (opts.privateKey ?? googleKeys.privateKey)
        .export({ type: 'pkcs8', format: 'pem' })
        .toString(),
      algorithm: 'RS256',
      keyid: KID,
    },
  );
}

describe('GoogleIdTokenVerifier', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ keys: [jwkFor(googleKeys.publicKey, KID)] }),
          {
            status: 200,
            headers: { 'cache-control': 'public, max-age=3600' },
          },
        ),
      ),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  const verify = (token: string, nonce = NONCE) =>
    new GoogleIdTokenVerifier(jwt).verify(token, {
      audience: CLIENT_ID,
      nonce,
    });

  it('token válido: devuelve la identidad (sub, email, email_verified, nombre)', async () => {
    await expect(verify(sign())).resolves.toEqual({
      sub: '1098765432',
      email: 'mateo@gmail.com',
      emailVerified: true,
      name: 'Mateo Gómez',
      givenName: 'Mateo',
      familyName: 'Gómez',
    });
  });

  it('acepta el issuer sin esquema (accounts.google.com)', async () => {
    await expect(verify(sign({ iss: 'accounts.google.com' }))).resolves.toEqual(
      expect.objectContaining({ sub: '1098765432' }),
    );
  });

  it.each([
    [
      'audience incorrecta',
      sign({ aud: 'otro-client.apps.googleusercontent.com' }),
    ],
    ['issuer incorrecto', sign({ iss: 'https://evil.example.com' })],
    ['token expirado', sign({}, { expiresIn: -60 })],
    [
      'firmado con otra clave',
      sign({}, { privateKey: attackerKeys.privateKey }),
    ],
  ])('rechaza: %s', async (_label, token) => {
    await expect(verify(token)).rejects.toBeInstanceOf(GoogleAuthError);
  });

  it('rechaza un nonce distinto al de la cookie', async () => {
    await expect(verify(sign(), 'x'.repeat(43))).rejects.toThrow(
      'nonce_mismatch',
    );
  });

  it('rechaza un token sin email', async () => {
    await expect(verify(sign({ email: undefined }))).rejects.toThrow(
      'missing_email',
    );
  });

  it('email_verified=false se reporta como no verificado (el servicio lo rechaza)', async () => {
    await expect(verify(sign({ email_verified: false }))).resolves.toEqual(
      expect.objectContaining({ emailVerified: false }),
    );
    // Un string "true" tampoco cuenta: solo el booleano.
    await expect(verify(sign({ email_verified: 'true' }))).resolves.toEqual(
      expect.objectContaining({ emailVerified: false }),
    );
  });

  it('rechaza alg distinto de RS256 (ej. HS256 con un secreto)', async () => {
    const hs = jwt.sign(
      {
        sub: 'x',
        aud: CLIENT_ID,
        iss: 'https://accounts.google.com',
        nonce: NONCE,
      },
      { secret: 'whatever', algorithm: 'HS256', keyid: KID },
    );
    await expect(verify(hs)).rejects.toThrow('malformed_id_token');
  });

  it('kid desconocido: refresca las JWKS una vez y, si sigue sin estar, rechaza', async () => {
    const verifier = new GoogleIdTokenVerifier(jwt);
    await verifier.verify(sign(), { audience: CLIENT_ID, nonce: NONCE });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Segunda verificación con el mismo kid: usa la caché.
    await verifier.verify(sign(), { audience: CLIENT_ID, nonce: NONCE });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const unknownKid = jwt.sign(
      { sub: 'x' },
      {
        privateKey: googleKeys.privateKey
          .export({ type: 'pkcs8', format: 'pem' })
          .toString(),
        algorithm: 'RS256',
        keyid: 'rotated-kid',
      },
    );
    await expect(
      verifier.verify(unknownKid, { audience: CLIENT_ID, nonce: NONCE }),
    ).rejects.toThrow('unknown_kid');
  });
});
