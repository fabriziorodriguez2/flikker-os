import { BadRequestException } from '@nestjs/common';
import { SlugPipe } from './slug.pipe';

describe('SlugPipe', () => {
  const pipe = new SlugPipe();

  describe('valid slugs', () => {
    it('accepts a standard 8-char base64url slug', () => {
      expect(pipe.transform('aBcDeFgH')).toBe('aBcDeFgH');
    });

    it('accepts slugs with digits', () => {
      expect(pipe.transform('a1B2c3D4')).toBe('a1B2c3D4');
    });

    it('accepts slugs with underscores and hyphens', () => {
      expect(pipe.transform('aB_-cD_-')).toBe('aB_-cD_-');
    });
  });

  describe('invalid slugs', () => {
    it('rejects empty string', () => {
      expect(() => pipe.transform('')).toThrow(BadRequestException);
    });

    it('rejects slug shorter than 8 chars', () => {
      expect(() => pipe.transform('aBcDeFg')).toThrow(BadRequestException);
    });

    it('rejects slug longer than 8 chars', () => {
      expect(() => pipe.transform('aBcDeFgHi')).toThrow(BadRequestException);
    });

    it('rejects slugs with special characters', () => {
      expect(() => pipe.transform('aBcD!@#$')).toThrow(BadRequestException);
    });

    it('rejects slugs with spaces', () => {
      expect(() => pipe.transform('aBcD eFg')).toThrow(BadRequestException);
    });

    it('rejects path traversal attempts', () => {
      expect(() => pipe.transform('../etc/p')).toThrow(BadRequestException);
    });

    it('rejects SQL injection attempts', () => {
      expect(() => pipe.transform("' OR 1=1")).toThrow(BadRequestException);
    });
  });
});
