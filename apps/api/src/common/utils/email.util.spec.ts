import { BadRequestException } from '@nestjs/common';
import { isValidEmail, normalizeEmail, parseEmail } from './email.util';

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Fabri@Gmail.COM ')).toBe('fabri@gmail.com');
  });
});

describe('isValidEmail', () => {
  it.each([
    'usuario@gmail.com',
    'nombre.apellido@negocio.com.uy',
    'a@b.co',
    '  Usuario@Gmail.com  ',
  ])('accepts %s', (email) => {
    expect(isValidEmail(email)).toBe(true);
  });

  it.each([
    'usuario@gmail', // the real-world bug: domain without a TLD
    'usuario@gmail.',
    'usuario@.com',
    'usuario',
    '@gmail.com',
    'usuario@gmail..com',
    'usuario @gmail.com',
    '',
  ])('rejects %s', (email) => {
    expect(isValidEmail(email)).toBe(false);
  });

  it('rejects emails longer than 254 characters', () => {
    const long = `${'a'.repeat(250)}@gmail.com`;
    expect(isValidEmail(long)).toBe(false);
  });
});

describe('parseEmail', () => {
  it('returns the normalized email when valid', () => {
    expect(parseEmail('  Fabri@Gmail.com ')).toBe('fabri@gmail.com');
  });

  it('throws for a domain without a TLD', () => {
    expect(() => parseEmail('fabri@gmail')).toThrow(BadRequestException);
  });

  it('throws for empty or missing values', () => {
    expect(() => parseEmail('   ')).toThrow(BadRequestException);
    expect(() => parseEmail(undefined)).toThrow(BadRequestException);
    expect(() => parseEmail(null)).toThrow(BadRequestException);
  });
});
