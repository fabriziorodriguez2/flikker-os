import { BusinessStatus, ExperienceVersion } from '@prisma/client';
import { RetentionProcessor } from '../../jobs/retention.processor';
import { RetentionV2EvaluateService } from './retention-v2-evaluate.service';

/**
 * The single rule this whole rollout rests on: a business belongs to exactly
 * one retention engine. If both engines could ever claim the same business,
 * its customers would receive two messages for the same drift.
 *
 * Rather than restating the two filters (which would just duplicate the bug if
 * one drifted), this suite captures the real `where` clauses the two engines
 * send to Prisma and evaluates them against every flag combination.
 */

type Flags = {
  isActive: boolean;
  experienceVersion: ExperienceVersion;
  retentionEngineV2Enabled: boolean;
  /**
   * Estar archivado ahora es parte de la propiedad: un negocio archivado no
   * pertenece a NINGÚN motor. Antes el legacy lo reclamaba igual y le seguía
   * mandando mensajes a sus clientes.
   */
  archivedAt: Date | null;
  status: BusinessStatus;
};

const ALL_FLAG_COMBINATIONS: Flags[] = [
  ExperienceVersion.LEGACY,
  ExperienceVersion.CHECKIN_V2,
].flatMap((experienceVersion) =>
  [true, false].flatMap((retentionEngineV2Enabled) =>
    [true, false].flatMap((isActive) =>
      // Los dos estados que importan: vivo, y archivado como lo escribe
      // `archiveBusiness` (los tres campos juntos).
      [
        { archivedAt: null, status: BusinessStatus.ACTIVE },
        { archivedAt: new Date(), status: BusinessStatus.ARCHIVED },
      ].map((archival) => ({
        isActive,
        experienceVersion,
        retentionEngineV2Enabled,
        ...archival,
      })),
    ),
  ),
);

/** Operativo = lo que `business-operational.guard` considera vivo. */
const isOperational = (f: Flags) =>
  f.isActive && f.archivedAt === null && f.status !== BusinessStatus.ARCHIVED;

/** Evaluates the subset of Prisma `where` syntax these two filters use. */
function matches(where: Record<string, unknown>, flags: Flags): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'NOT') {
      return !matches(value as Record<string, unknown>, flags);
    }
    if (key === 'business') {
      return matches(value as Record<string, unknown>, flags);
    }
    if (value !== null && typeof value === 'object' && 'not' in value) {
      return flags[key as keyof Flags] !== (value as { not: unknown }).not;
    }
    if (key === 'enabled') {
      // The sequence's own enabled flag, not a business flag: assume the
      // business has an enabled legacy sequence, which is the worst case.
      return true;
    }
    return flags[key as keyof Flags] === value;
  });
}

async function captureLegacyWhere(): Promise<Record<string, unknown>> {
  const findMany = jest.fn().mockResolvedValue([]);
  const prisma = { retentionSequence: { findMany } };
  const processor = new RetentionProcessor(prisma as never, {} as never);

  await processor.runDaily(new Date('2026-09-02T15:00:00.000Z'));

  return (findMany.mock.calls[0][0] as { where: Record<string, unknown> })
    .where;
}

async function captureV2Where(): Promise<Record<string, unknown>> {
  const findMany = jest.fn().mockResolvedValue([]);
  const prisma = { business: { findMany } };
  const service = new RetentionV2EvaluateService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  await service.runDaily(new Date('2026-09-02T15:00:00.000Z'));

  return (findMany.mock.calls[0][0] as { where: Record<string, unknown> })
    .where;
}

describe('Retention engine ownership — legacy and V2 never overlap', () => {
  it('no flag combination is claimed by both engines', async () => {
    const legacy = await captureLegacyWhere();
    const v2 = await captureV2Where();

    const overlapping = ALL_FLAG_COMBINATIONS.filter(
      (flags) => matches(legacy, flags) && matches(v2, flags),
    );

    expect(overlapping).toEqual([]);
  });

  it('an active business is always claimed by exactly one engine', async () => {
    const legacy = await captureLegacyWhere();
    const v2 = await captureV2Where();

    for (const flags of ALL_FLAG_COMBINATIONS.filter(isOperational)) {
      const owners = [
        matches(legacy, flags) ? 'legacy' : null,
        matches(v2, flags) ? 'v2' : null,
      ].filter(Boolean);

      expect({ flags, owners }).toEqual({
        flags,
        owners: [expect.any(String)],
      });
    }
  });

  it('only CHECKIN_V2 + engine enabled belongs to V2', async () => {
    const v2 = await captureV2Where();

    expect(ALL_FLAG_COMBINATIONS.filter((flags) => matches(v2, flags))).toEqual(
      [
        {
          isActive: true,
          experienceVersion: ExperienceVersion.CHECKIN_V2,
          retentionEngineV2Enabled: true,
          archivedAt: null,
          status: BusinessStatus.ACTIVE,
        },
      ],
    );
  });

  it('a half-migrated business (CHECKIN_V2 but engine off) stays with legacy', async () => {
    const legacy = await captureLegacyWhere();
    const v2 = await captureV2Where();
    const halfMigrated: Flags = {
      isActive: true,
      experienceVersion: ExperienceVersion.CHECKIN_V2,
      retentionEngineV2Enabled: false,
      archivedAt: null,
      status: BusinessStatus.ACTIVE,
    };

    // The dangerous failure is being dropped by *both* engines, which would
    // silently stop retention for that business.
    expect(matches(v2, halfMigrated)).toBe(false);
    expect(matches(legacy, halfMigrated)).toBe(true);
  });

  it('a LEGACY business with the V2 flag mistakenly on stays with legacy', async () => {
    const legacy = await captureLegacyWhere();
    const v2 = await captureV2Where();
    const misconfigured: Flags = {
      isActive: true,
      experienceVersion: ExperienceVersion.LEGACY,
      retentionEngineV2Enabled: true,
      archivedAt: null,
      status: BusinessStatus.ACTIVE,
    };

    expect(matches(v2, misconfigured)).toBe(false);
    expect(matches(legacy, misconfigured)).toBe(true);
  });
});
