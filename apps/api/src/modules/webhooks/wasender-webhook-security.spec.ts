import {
  isDuplicateWebhookEvent,
  isValidWaSenderSignature,
  resetWaSenderWebhookDedupeCache,
} from './wasender-webhook-security';

describe('isValidWaSenderSignature', () => {
  it('true when the header matches the secret exactly', () => {
    expect(isValidWaSenderSignature('secret-1', 'secret-1')).toBe(true);
  });

  it('false when the header does not match', () => {
    expect(isValidWaSenderSignature('wrong', 'secret-1')).toBe(false);
  });

  it('false when the header is missing', () => {
    expect(isValidWaSenderSignature(undefined, 'secret-1')).toBe(false);
  });

  it('false when no secret is configured — never treated as "no check needed"', () => {
    expect(isValidWaSenderSignature('anything', undefined)).toBe(false);
  });

  it('false for an array header value (never trusted)', () => {
    expect(isValidWaSenderSignature(['a', 'b'], 'secret-1')).toBe(false);
  });

  it('false for a different-length header — never throws', () => {
    expect(isValidWaSenderSignature('short', 'a-much-longer-secret')).toBe(
      false,
    );
  });
});

describe('isDuplicateWebhookEvent', () => {
  beforeEach(() => resetWaSenderWebhookDedupeCache());

  it('false the first time a key is seen, true the second time', () => {
    expect(isDuplicateWebhookEvent('event-1')).toBe(false);
    expect(isDuplicateWebhookEvent('event-1')).toBe(true);
  });

  it('different keys never collide', () => {
    expect(isDuplicateWebhookEvent('event-1')).toBe(false);
    expect(isDuplicateWebhookEvent('event-2')).toBe(false);
  });

  it('expires after the TTL', () => {
    const start = Date.now();
    expect(isDuplicateWebhookEvent('event-1', start)).toBe(false);
    expect(isDuplicateWebhookEvent('event-1', start + 11 * 60 * 1000)).toBe(
      false,
    );
  });
});
