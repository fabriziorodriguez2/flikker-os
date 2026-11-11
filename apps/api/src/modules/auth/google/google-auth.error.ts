/**
 * Falla interna de "Continuar con Google". El `reason` es solo para logs —
 * hacia afuera todas se ven igual ("No pudimos iniciar sesión con Google"),
 * nunca se revela cuál fue.
 */
export class GoogleAuthError extends Error {
  constructor(public readonly reason: string) {
    super(`Google auth failed: ${reason}`);
    this.name = 'GoogleAuthError';
  }
}
