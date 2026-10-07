import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

// PGlite runs PostgreSQL in a separate process; no application DB or migrations.
it('executes the actual activity SQL: tenants, event semantics, ordering and pagination', () => {
  const output = execFileSync(
    process.execPath,
    [resolve(__dirname, '../../../test/place-activity.postgres.cjs')],
    { encoding: 'utf8', timeout: 20000 },
  );
  const result = JSON.parse(output.trim()) as {
    passed: boolean;
    paginatedRows: number;
  };
  expect(result.passed).toBe(true);
  expect(result.paginatedRows).toBe(57);
}, 25000);
