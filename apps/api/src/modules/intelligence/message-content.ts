import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

export const MAX_MESSAGE_CONTENT_LENGTH = 8_000;
export const MAX_METADATA_BYTES = 4_096;
const MAX_METADATA_DEPTH = 5;
export const AUTO_TITLE_MAX_LENGTH = 60;
export const DEFAULT_CONVERSATION_TITLE = 'Nueva conversación';

const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PHONE_RE = /\+?\d[\d\s().-]{6,}\d/;
const UUID_GLOBAL_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const ISO_DATE_GLOBAL_RE =
  /\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?/g;

export function validateMessageContent(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    throw new BadRequestException('Message content is empty');
  }
  if (trimmed.length > MAX_MESSAGE_CONTENT_LENGTH) {
    throw new BadRequestException('Message content is too long');
  }
  return trimmed;
}

/**
 * La metadata es para referencias internas (ids, códigos, nombres de tool),
 * nunca para datos de contacto: se rechaza cualquier string con forma de
 * email o teléfono. UUIDs y fechas ISO se ignoran en ese chequeo.
 */
export function validateMessageMetadata(
  metadata: unknown,
): Prisma.InputJsonObject | undefined {
  if (metadata === undefined || metadata === null) return undefined;

  if (!isPlainObject(metadata)) {
    throw new BadRequestException('Message metadata must be a JSON object');
  }

  const serialized = JSON.stringify(metadata);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_METADATA_BYTES) {
    throw new BadRequestException('Message metadata is too large');
  }

  assertSafeValue(metadata, 1);
  return JSON.parse(serialized) as Prisma.InputJsonObject;
}

function assertSafeValue(value: unknown, depth: number): void {
  if (depth > MAX_METADATA_DEPTH) {
    throw new BadRequestException('Message metadata is too deeply nested');
  }
  if (typeof value === 'string') {
    const withoutIds = value
      .replace(UUID_GLOBAL_RE, '')
      .replace(ISO_DATE_GLOBAL_RE, '');
    if (EMAIL_RE.test(withoutIds) || PHONE_RE.test(withoutIds)) {
      throw new BadRequestException(
        'Message metadata must not contain contact data',
      );
    }
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new BadRequestException('Message metadata has an invalid number');
    }
    return;
  }
  if (value === null || typeof value === 'boolean') return;
  if (Array.isArray(value)) {
    value.forEach((item) => assertSafeValue(item, depth + 1));
    return;
  }
  if (isPlainObject(value)) {
    Object.values(value).forEach((item) => assertSafeValue(item, depth + 1));
    return;
  }
  throw new BadRequestException('Message metadata has an unsupported value');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

export function deriveAutoTitle(content: string): string {
  const collapsed = content.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= AUTO_TITLE_MAX_LENGTH) return collapsed;
  const cut = collapsed.slice(0, AUTO_TITLE_MAX_LENGTH);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
