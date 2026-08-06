import { NotFoundException } from '@nestjs/common';
import { ExperienceVersion } from '@prisma/client';
import { CheckinV2Guard } from './checkin-v2.guard';

function makeContext(request: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
}

function makePrisma(experienceVersion: ExperienceVersion | null) {
  return {
    business: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          experienceVersion === null ? null : { experienceVersion },
        ),
    },
  };
}

describe('CheckinV2Guard', () => {
  it('lets a CHECKIN_V2 business through', async () => {
    const prisma = makePrisma(ExperienceVersion.CHECKIN_V2);
    const guard = new CheckinV2Guard(prisma as never);

    await expect(
      guard.canActivate(makeContext({ currentBusinessId: 'biz-1' })),
    ).resolves.toBe(true);
  });

  it('answers 404 (not 403) for a LEGACY business so the feature stays hidden', async () => {
    const prisma = makePrisma(ExperienceVersion.LEGACY);
    const guard = new CheckinV2Guard(prisma as never);

    await expect(
      guard.canActivate(makeContext({ currentBusinessId: 'biz-1' })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects when there is no tenant context', async () => {
    const prisma = makePrisma(ExperienceVersion.CHECKIN_V2);
    const guard = new CheckinV2Guard(prisma as never);

    await expect(guard.canActivate(makeContext({}))).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.business.findUnique).not.toHaveBeenCalled();
  });

  it('rejects when the business does not exist', async () => {
    const prisma = makePrisma(null);
    const guard = new CheckinV2Guard(prisma as never);

    await expect(
      guard.canActivate(makeContext({ currentBusinessId: 'ghost' })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('caches the flag on the request so a second guard does not re-query', async () => {
    const prisma = makePrisma(ExperienceVersion.CHECKIN_V2);
    const guard = new CheckinV2Guard(prisma as never);
    const request: Record<string, unknown> = { currentBusinessId: 'biz-1' };

    await guard.canActivate(makeContext(request));
    await guard.canActivate(makeContext(request));

    expect(prisma.business.findUnique).toHaveBeenCalledTimes(1);
  });
});
