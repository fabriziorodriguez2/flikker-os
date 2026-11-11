import { BadRequestException } from '@nestjs/common';

/**
 * Cursor opaco para paginación keyset por `(fecha, id)`. Opaco para que el
 * frontend nunca arme ni edite uno: solo devuelve el que recibió. Decodificar
 * uno ajeno no da acceso a nada — el cursor solo acota el orden, y toda query
 * sigue filtrando por negocio + dueño.
 */
export interface KeysetCursor {
  at: Date;
  id: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeCursor(cursor: KeysetCursor): string {
  return Buffer.from(
    JSON.stringify({ t: cursor.at.toISOString(), id: cursor.id }),
  ).toString('base64url');
}

export function decodeCursor(raw: string): KeysetCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw new BadRequestException('Invalid cursor');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new BadRequestException('Invalid cursor');
  }
  const { t, id } = parsed as Record<string, unknown>;
  const at = typeof t === 'string' ? new Date(t) : null;
  if (
    !at ||
    Number.isNaN(at.getTime()) ||
    typeof id !== 'string' ||
    !UUID_RE.test(id)
  ) {
    throw new BadRequestException('Invalid cursor');
  }
  return { at, id };
}
