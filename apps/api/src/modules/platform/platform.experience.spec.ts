import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ExperienceVersion } from '@prisma/client';
import { PlatformService } from './platform.service';

/**
 * Rollout administration: only a platform admin can flip a business between
 * experiences (enforced by PlatformAdminGuard on the controller), the switch is
 * audited, and it never deletes V2 data in either direction.
 */
function makeService(overrides: {
  existing?: {
    experienceVersion: ExperienceVersion;
    retentionEngineV2Enabled: boolean;
  } | null;
}) {
  const existing =
    overrides.existing === undefined
      ? {
          experienceVersion: ExperienceVersion.LEGACY,
          retentionEngineV2Enabled: false,
        }
      : overrides.existing;

  const prisma = {
    business: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          existing === null
            ? null
            : { id: 'biz-1', name: 'Café Uno', ...existing },
        ),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'biz-1',
          name: 'Café Uno',
          slug: 'cafe-uno',
          experienceVersion:
            data.experienceVersion ?? existing?.experienceVersion,
          retentionEngineV2Enabled:
            data.retentionEngineV2Enabled ??
            existing?.retentionEngineV2Enabled ??
            false,
        }),
      ),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };

  const service = Object.create(PlatformService.prototype) as PlatformService;
  Object.assign(service, {
    prisma,
    logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    logPlatformWrite: jest.fn(),
  });

  return { service, prisma };
}

describe('PlatformService.setExperience', () => {
  it('activates Check-in V2 for a business', async () => {
    const { service, prisma } = makeService({});

    const result = await service.setExperience('admin-1', 'biz-1', {
      experienceVersion: ExperienceVersion.CHECKIN_V2,
    });

    expect(prisma.business.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'biz-1' },
        data: { experienceVersion: ExperienceVersion.CHECKIN_V2 },
      }),
    );
    expect(result.experienceVersion).toBe(ExperienceVersion.CHECKIN_V2);
  });

  it('reverts to LEGACY without deleting any V2 data', async () => {
    const { service, prisma } = makeService({
      existing: {
        experienceVersion: ExperienceVersion.CHECKIN_V2,
        retentionEngineV2Enabled: false,
      },
    });

    const result = await service.setExperience('admin-1', 'biz-1', {
      experienceVersion: ExperienceVersion.LEGACY,
    });

    expect(result.experienceVersion).toBe(ExperienceVersion.LEGACY);
    // Only the flag is written — no deleteMany of visits/sources/sessions.
    const dataWritten = prisma.business.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(Object.keys(dataWritten.data)).toEqual(['experienceVersion']);
  });

  it('persists retentionEngineV2Enabled on its own axis', async () => {
    const { service } = makeService({});

    const result = await service.setExperience('admin-1', 'biz-1', {
      retentionEngineV2Enabled: true,
    });

    // Experience untouched: the two flags are independent.
    expect(result.experienceVersion).toBe(ExperienceVersion.LEGACY);
    expect(result.retentionEngineV2Enabled).toBe(true);
  });

  it('audits the change with the previous and new values', async () => {
    const { service } = makeService({});
    const logged = (service as unknown as { logPlatformWrite: jest.Mock })
      .logPlatformWrite;

    await service.setExperience('admin-1', 'biz-1', {
      experienceVersion: ExperienceVersion.CHECKIN_V2,
    });

    expect(logged).toHaveBeenCalledWith(
      'admin-1',
      'biz-1',
      'PLATFORM_EXPERIENCE_CHANGED',
      expect.objectContaining({
        from: expect.objectContaining({
          experienceVersion: ExperienceVersion.LEGACY,
        }),
        to: expect.objectContaining({
          experienceVersion: ExperienceVersion.CHECKIN_V2,
        }),
      }),
    );
  });

  it('rejects an unknown business', async () => {
    const { service } = makeService({ existing: null });

    await expect(
      service.setExperience('admin-1', 'ghost', {
        experienceVersion: ExperienceVersion.CHECKIN_V2,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects an empty payload', async () => {
    const { service } = makeService({});

    await expect(
      service.setExperience('admin-1', 'biz-1', {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
