import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { bootIsolatedSimulationContext } from './simulation-context';
import { SimulationRootModule } from './simulation-root.module';

/**
 * §1/§2 — this is the one test that must prove, against real Postgres, that
 * an isolated simulation context lands on a genuinely different database
 * than the main app — not just that the code *looks* like it should.
 *
 * Requires `SIMULATION_DATABASE_URL` to point at a real, already-migrated,
 * DIFFERENT database from `DATABASE_URL` (see CLAUDE.md-adjacent local
 * setup: `flikker_simulation` alongside `flikker_os` on the same local
 * Postgres instance). Skipped — not failed — when that is not configured,
 * so CI/dev environments without a provisioned simulation database don't
 * hard-fail on every run; this is the deliberate exception called out in
 * CLAUDE.md §10 ("si no se agregan tests por una razón válida, decirlo
 * explícitamente") for a test whose entire point requires infrastructure
 * that is opt-in by design (§42).
 */
const simulationDatabaseUrl = process.env.SIMULATION_DATABASE_URL;
const describeIfConfigured = simulationDatabaseUrl ? describe : describe.skip;

function dbNameOf(url: string): string {
  return new URL(url).pathname.replace(/^\//, '');
}

describeIfConfigured(
  'bootIsolatedSimulationContext (integration) — §1/§2: genuinely a different database',
  () => {
    it('connects the isolated context to SIMULATION_DATABASE_URL, never to the real DATABASE_URL, and restores env afterwards', async () => {
      const realDatabaseUrl = process.env.DATABASE_URL;
      expect(realDatabaseUrl).toBeTruthy();
      expect(simulationDatabaseUrl).not.toBe(realDatabaseUrl);

      const app = await bootIsolatedSimulationContext(
        SimulationRootModule,
        simulationDatabaseUrl!,
      );

      // The swap must already be reverted by the time boot resolves — no
      // caller can ever observe the simulation URL leaking into the shared
      // process.env after this point.
      expect(process.env.DATABASE_URL).toBe(realDatabaseUrl);

      try {
        const simPrisma = app.get(PrismaService);
        const [{ current_database: simDbName }] =
          await simPrisma.$queryRawUnsafe<{ current_database: string }[]>(
            'SELECT current_database()',
          );

        expect(simDbName).toBe(dbNameOf(simulationDatabaseUrl!));
        expect(simDbName).not.toBe(dbNameOf(realDatabaseUrl!));
      } finally {
        await app.close();
      }

      // And the main app's own PrismaService, built fresh right now, is
      // still pointed at the real database — completely unaffected by the
      // simulation context that just ran and closed.
      const realModule = await Test.createTestingModule({
        providers: [PrismaService],
      }).compile();
      const realPrisma = realModule.get(PrismaService);
      try {
        const [{ current_database: realDbName }] =
          await realPrisma.$queryRawUnsafe<{ current_database: string }[]>(
            'SELECT current_database()',
          );
        expect(realDbName).toBe(dbNameOf(realDatabaseUrl!));
      } finally {
        await realModule.close();
      }
    });
  },
);
