import { BadRequestException } from '@nestjs/common';
import { decodeCursor, encodeCursor } from './conversation-cursor';
import {
  AUTO_TITLE_MAX_LENGTH,
  deriveAutoTitle,
  MAX_MESSAGE_CONTENT_LENGTH,
  validateMessageContent,
  validateMessageMetadata,
} from './message-content';

const ID = '3f2b8c1e-9a4d-4e2f-8b7a-1c2d3e4f5a6b';

describe('conversation cursor', () => {
  it('round-trips date and id', () => {
    const at = new Date('2026-11-09T12:00:00.123Z');
    expect(decodeCursor(encodeCursor({ at, id: ID }))).toEqual({ at, id: ID });
  });

  it.each([
    'not-base64-json',
    Buffer.from('[]').toString('base64url'),
    Buffer.from(JSON.stringify({ t: 'nope', id: ID })).toString('base64url'),
    Buffer.from(
      JSON.stringify({ t: new Date().toISOString(), id: "1' OR 1=1" }),
    ).toString('base64url'),
  ])('rejects a malformed cursor (%s)', (raw) => {
    expect(() => decodeCursor(raw)).toThrow(BadRequestException);
  });
});

describe('validateMessageContent', () => {
  it('trims and accepts normal text', () => {
    expect(validateMessageContent('  hola  ')).toBe('hola');
  });

  it('rejects empty and oversized content', () => {
    expect(() => validateMessageContent('   ')).toThrow(BadRequestException);
    expect(() =>
      validateMessageContent('a'.repeat(MAX_MESSAGE_CONTENT_LENGTH + 1)),
    ).toThrow(BadRequestException);
  });
});

describe('validateMessageMetadata', () => {
  it('accepts a small object with ids and codes', () => {
    expect(
      validateMessageMetadata({ tool: 'overview', customerId: ID, count: 3 }),
    ).toEqual({ tool: 'overview', customerId: ID, count: 3 });
  });

  it('does not mistake ISO dates for phone numbers', () => {
    expect(
      validateMessageMetadata({
        from: '2026-11-09',
        at: '2026-11-09T12:00:00.123Z',
      }),
    ).toEqual({ from: '2026-11-09', at: '2026-11-09T12:00:00.123Z' });
  });

  it('treats null/undefined as no metadata', () => {
    expect(validateMessageMetadata(undefined)).toBeUndefined();
    expect(validateMessageMetadata(null)).toBeUndefined();
  });

  it.each([
    ['an array', [1, 2]],
    ['a string', 'hola'],
    ['an email', { note: 'escribile a ana@example.com' }],
    ['a phone', { phone: '+598 99 123 456' }],
    ['a nested phone', { a: { b: ['099123456'] } }],
    ['a too deep object', { a: { b: { c: { d: { e: { f: 1 } } } } } }],
    ['an oversized object', { blob: 'x'.repeat(5_000) }],
    ['a class instance', { at: new Date() }],
  ])('rejects %s', (_label, value) => {
    expect(() => validateMessageMetadata(value)).toThrow(BadRequestException);
  });
});

describe('deriveAutoTitle', () => {
  it('keeps short text as-is, collapsing whitespace', () => {
    expect(deriveAutoTitle('¿Cuántos   clientes\nvolvieron?')).toBe(
      '¿Cuántos clientes volvieron?',
    );
  });

  it('cuts long text on a word boundary with an ellipsis', () => {
    const title = deriveAutoTitle(
      'Quiero entender por qué los clientes que vinieron en septiembre no volvieron en octubre',
    );
    expect(title.endsWith('…')).toBe(true);
    expect(title.length).toBeLessThanOrEqual(AUTO_TITLE_MAX_LENGTH + 1);
  });
});
