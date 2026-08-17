import { BadRequestException } from '@nestjs/common';
import { normalizeToE164 } from './phone.util';

describe('normalizeToE164', () => {
  it.each([
    ['098123456', '+59898123456'],
    ['98123456', '+59898123456'],
    ['+59898123456', '+59898123456'],
    ['099 123 456', '+59899123456'],
    ['+14155552671', '+14155552671'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeToE164(input)).toBe(expected);
  });

  it('rejects invalid phone lengths', () => {
    expect(() => normalizeToE164('12')).toThrow(BadRequestException);
  });

  /**
   * Migración WaSenderAPI (§5) — este normalizador YA produce el E.164 que
   * la documentación oficial pide (`"+1234567890"`), así que se reusa tal
   * cual para el nuevo proveedor. Ningún normalizador nuevo. Estos casos
   * documentan el comportamiento REAL de hoy (incluidos sus límites), no
   * uno nuevo — no se cambió nada acá.
   */
  it.each([
    ['+598 99 123-456', '+59899123456'], // espacios y guiones combinados
    ['099-123-456', '+59899123456'], // guiones, sin `+`
    ['+1 (415) 555-2671', '+14155552671'], // internacional con guiones/paréntesis
  ])('normaliza %s (espacios/guiones) a %s', (input, expected) => {
    expect(normalizeToE164(input)).toBe(expected);
  });

  it('rechaza un valor claramente inválido (sin dígitos suficientes)', () => {
    expect(() => normalizeToE164('abc')).toThrow(BadRequestException);
  });

  it('rechaza string vacío', () => {
    expect(() => normalizeToE164('')).toThrow(BadRequestException);
  });

  /**
   * Comportamiento documentado, no "arreglado": un número que YA incluye el
   * código de país pero sin `+` se trata como número NACIONAL y se le
   * antepone el country code igual — es la semántica actual (pensada para
   * inputs de un formulario local, no para normalizar cualquier string).
   * Cambiarla está fuera de alcance de esta migración (§5 — "no cambiar
   * semántica actual innecesariamente").
   */
  it('un número con código de país pero SIN "+" se trata como nacional (comportamiento actual, no un bug de esta migración)', () => {
    expect(normalizeToE164('59899123456')).toBe('+59859899123456');
  });
});
