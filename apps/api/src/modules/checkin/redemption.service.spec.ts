import { ConflictException, NotFoundException } from '@nestjs/common';
import { CustomerEventType } from '@prisma/client';
import { RedemptionService } from './redemption.service';

function makeDeps() {
  const prisma = {
    business: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ timezone: 'America/Montevideo', experienceVersion: 'CHECKIN_V2' }),
    },
  };
  const benefits = {
    consumeRedemption: jest.fn(),
    attachRedeemedVisit: jest.fn().mockResolvedValue(undefined),
  };
  const visits = {
    registerRedemptionVisit: jest.fn().mockResolvedValue({ id: 'visit-1' }),
  };
  const events = { emit: jest.fn().mockResolvedValue(undefined) };
  return { prisma, benefits, visits, events };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new RedemptionService(
    deps.prisma as never,
    deps.benefits as never,
    deps.visits as never,
    deps.events as never,
  );
}

describe('RedemptionService', () => {
  it('redeems a valid code: registers the visit, links it, emits the event', async () => {
    const deps = makeDeps();
    deps.benefits.consumeRedemption.mockResolvedValue({
      status: 'ok',
      participationId: 'p-1',
      benefitId: 'b-1',
      customerId: 'c-1',
      benefitTitle: '10% off',
      benefitType: 'discount',
      customerName: 'Ana',
    });
    const service = makeService(deps);

    const result = await service.redeem('biz-1', 'user-1', ' abcd1234 ');

    // Code is normalized (trim + uppercase) before consuming.
    expect(deps.benefits.consumeRedemption).toHaveBeenCalledWith(
      'biz-1',
      'ABCD1234',
      'user-1',
    );
    expect(deps.visits.registerRedemptionVisit).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 'biz-1',
        customerId: 'c-1',
        benefitId: 'b-1',
        participationId: 'p-1',
      }),
    );
    expect(deps.benefits.attachRedeemedVisit).toHaveBeenCalledWith(
      'p-1',
      'visit-1',
    );
    expect(deps.events.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: CustomerEventType.benefit_redeemed,
        visitId: 'visit-1',
      }),
    );
    expect(result).toEqual({
      ok: true,
      customerName: 'Ana',
      benefitTitle: '10% off',
      visitId: 'visit-1',
    });
  });

  it('throws NotFound for an unknown code and never touches visits', async () => {
    const deps = makeDeps();
    deps.benefits.consumeRedemption.mockResolvedValue({ status: 'not_found' });
    const service = makeService(deps);

    await expect(
      service.redeem('biz-1', 'user-1', 'XXXX'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(deps.visits.registerRedemptionVisit).not.toHaveBeenCalled();
  });

  it('throws Conflict for an already-redeemed code (no double canje)', async () => {
    const deps = makeDeps();
    deps.benefits.consumeRedemption.mockResolvedValue({ status: 'already' });
    const service = makeService(deps);

    await expect(
      service.redeem('biz-1', 'user-1', 'ABCD1234'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(deps.visits.registerRedemptionVisit).not.toHaveBeenCalled();
    expect(deps.events.emit).not.toHaveBeenCalled();
  });
});
