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
});
