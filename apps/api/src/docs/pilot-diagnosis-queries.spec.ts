import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * El SQL de diagnóstico del negocio piloto se corre a mano contra
 * PRODUCCIÓN. Este test lo vigila: solo lectura, con tiempos máximos, y sin
 * devolver datos personales de clientes.
 */
const SQL = readFileSync(
  join(__dirname, '../../../../docs/pilot-diagnosis-queries.sql'),
  'utf8',
);
/**
 * Sin comentarios: lo que de verdad ejecuta Postgres. Se corta también en
 * CRLF (checkout en Windows): `.` no matchea `\r`, y un `--` seguido de `\r`
 * dejaba el comentario entero como si fuera código.
 */
const CODE = SQL.split(/\r?\n/)
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n');
const statements = CODE.split(';')
  .map((s) => s.trim())
  .filter(Boolean);

describe('docs/pilot-diagnosis-queries.sql', () => {
  it('corre dentro de una transacción de solo lectura que termina en ROLLBACK', () => {
    expect(statements[0]).toMatch(/BEGIN TRANSACTION READ ONLY$/);
    expect(statements.at(-1)).toBe('ROLLBACK');
    expect(CODE).not.toMatch(/\bCOMMIT\b/i);
  });

  it('tiene tiempos máximos por consulta, por bloqueo y por sesión colgada', () => {
    expect(CODE).toMatch(/SET LOCAL statement_timeout = '\d+s'/);
    expect(CODE).toMatch(/SET LOCAL lock_timeout = '\d+s'/);
    expect(CODE).toMatch(/SET LOCAL idle_in_transaction_session_timeout/);
  });

  it('no escribe, no cambia permisos ni exporta archivos', () => {
    expect(CODE).not.toMatch(
      /\b(INSERT|UPDATE|DELETE|MERGE|UPSERT|ALTER|DROP|CREATE|TRUNCATE|GRANT|REVOKE|COPY|VACUUM|REINDEX|CALL|DO)\b/i,
    );
    for (const s of statements.slice(1, -1)) {
      expect(s).toMatch(
        /^(\\set ON_ERROR_STOP on\s+)?(SET LOCAL|SELECT|WITH)\b/,
      );
    }
  });

  it('nunca devuelve nombre, email, cumpleaños ni teléfono de clientes', () => {
    expect(CODE).not.toMatch(/\b(email|birthday)\b/i);
    expect(CODE).not.toMatch(/\bc\.name\b/);
    // El teléfono solo aparece para contar quién tiene uno, nunca como columna.
    for (const match of CODE.matchAll(/phone_e164/gi)) {
      const before = CODE.slice(Math.max(0, match.index - 40), match.index);
      expect(before).toMatch(/trim\($/);
    }
    // Ningún id de cliente sale como columna: solo dentro de conteos o de un
    // paso intermedio (CTE) que después se agrega.
    for (const statement of statements) {
      const outer = /\)\s*SELECT\b/i.exec(statement);
      const start = outer ? outer.index : statement.search(/\bSELECT\b/i);
      if (start < 0) continue;
      const projection = statement.slice(start).split(/\bFROM\b/i)[0];
      expect(projection).not.toMatch(/\bcustomer_id\b(?!\))/i);
    }
  });

  it('los textos de error salen recortados y sin números largos', () => {
    const errorColumns = CODE.match(/metadata ->> 'error'|fail_reason/g) ?? [];
    expect(errorColumns.length).toBeGreaterThan(0);
    expect(
      CODE.match(/regexp_replace\([\s\S]*?'\\d\{7,\}', '\[num\]'/g)?.length,
    ).toBe(2);
  });
});
