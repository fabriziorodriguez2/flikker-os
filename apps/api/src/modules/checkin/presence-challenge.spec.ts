import {
  currentPresenceChallenge,
  verifyPresenceCode,
  PRESENCE_ACCEPTED_PREVIOUS_WINDOWS,
  PRESENCE_WINDOW_SECONDS,
} from './presence-challenge';

const SECRET = 'a'.repeat(48);
const OTHER_SECRET = 'b'.repeat(48);
const BIZ = 'biz-1';

/** Un instante fijo, para no depender del reloj real. */
const T0 = new Date('2026-08-24T15:00:00.000Z');
const plusSeconds = (base: Date, s: number) =>
  new Date(base.getTime() + s * 1000);

describe('presence challenge — derivación', () => {
  it('el mismo negocio y la misma ventana dan siempre el mismo código', () => {
    const a = currentPresenceChallenge(SECRET, BIZ, T0);
    const b = currentPresenceChallenge(SECRET, BIZ, plusSeconds(T0, 10));
    expect(a.code).toBe(b.code);
    expect(a.challengeId).toBe(b.challengeId);
  });

  it('dos negocios distintos nunca comparten el código de la misma ventana', () => {
    expect(currentPresenceChallenge(SECRET, 'biz-a', T0).code).not.toBe(
      currentPresenceChallenge(SECRET, 'biz-b', T0).code,
    );
  });

  it('el código rota al pasar a la ventana siguiente', () => {
    const now = currentPresenceChallenge(SECRET, BIZ, T0);
    const next = currentPresenceChallenge(
      SECRET,
      BIZ,
      plusSeconds(T0, PRESENCE_WINDOW_SECONDS),
    );
    expect(next.code).not.toBe(now.code);
    expect(next.challengeId).not.toBe(now.challengeId);
  });

  it('sin el secreto del servidor el código no se puede derivar', () => {
    expect(currentPresenceChallenge(OTHER_SECRET, BIZ, T0).code).not.toBe(
      currentPresenceChallenge(SECRET, BIZ, T0).code,
    );
  });

  it('el challengeId no contiene el código — leer la Visit no lo revela', () => {
    const challenge = currentPresenceChallenge(SECRET, BIZ, T0);
    expect(challenge.challengeId).not.toContain(challenge.code);
  });
});

describe('presence challenge — verificación', () => {
  it('acepta el código vigente', () => {
    const { code, challengeId } = currentPresenceChallenge(SECRET, BIZ, T0);
    const result = verifyPresenceCode(SECRET, BIZ, code, T0);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.challenge.challengeId).toBe(challengeId);
  });

  it('acepta minúsculas y espacios — el cliente tipea a mano', () => {
    const { code } = currentPresenceChallenge(SECRET, BIZ, T0);
    expect(
      verifyPresenceCode(SECRET, BIZ, `  ${code.toLowerCase()} `, T0).valid,
    ).toBe(true);
  });

  it('tolera UNA ventana anterior — el código no muere en la cara del cliente', () => {
    const { code } = currentPresenceChallenge(SECRET, BIZ, T0);
    const justAfterRotation = plusSeconds(T0, PRESENCE_WINDOW_SECONDS + 5);
    expect(verifyPresenceCode(SECRET, BIZ, code, justAfterRotation).valid).toBe(
      true,
    );
  });

  it('un código guardado y usado al día siguiente NO vale', () => {
    const { code } = currentPresenceChallenge(SECRET, BIZ, T0);
    const tomorrow = plusSeconds(T0, 24 * 3600);
    const result = verifyPresenceCode(SECRET, BIZ, code, tomorrow);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('expired');
  });

  it('vence apenas se supera la tolerancia — no hay ventana gris larga', () => {
    const { code } = currentPresenceChallenge(SECRET, BIZ, T0);
    const past = plusSeconds(
      T0,
      PRESENCE_WINDOW_SECONDS * (PRESENCE_ACCEPTED_PREVIOUS_WINDOWS + 1) + 5,
    );
    expect(verifyPresenceCode(SECRET, BIZ, code, past).valid).toBe(false);
  });

  it('el código de OTRO negocio no vale acá — no hay fuga cross-tenant', () => {
    const { code } = currentPresenceChallenge(SECRET, 'biz-otro', T0);
    expect(verifyPresenceCode(SECRET, BIZ, code, T0).valid).toBe(false);
  });

  it('rechaza vacío, largo incorrecto y basura', () => {
    for (const bad of ['', '  ', 'ABC', 'ABCDEFGH', '!!!!!!']) {
      expect(verifyPresenceCode(SECRET, BIZ, bad, T0).valid).toBe(false);
    }
  });
});
