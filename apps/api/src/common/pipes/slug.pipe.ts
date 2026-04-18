import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

/**
 * Validates that a route parameter looks like a valid QR slug:
 * 8 characters, base64url alphabet [A-Za-z0-9_-].
 *
 * Rejects malformed slugs early, before hitting the database.
 */
@Injectable()
export class SlugPipe implements PipeTransform<string, string> {
  private static readonly SLUG_REGEX = /^[A-Za-z0-9_-]{8}$/;

  transform(value: string): string {
    if (!SlugPipe.SLUG_REGEX.test(value)) {
      throw new BadRequestException('Invalid slug format');
    }
    return value;
  }
}
