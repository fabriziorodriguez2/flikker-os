import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  PlaceActivityService,
  parseActivityCursor,
  presentActivity,
  ActivityType,
} from './place-activity.service';
import { MyFlikkerController } from './my-flikker.controller';
import { FlikkerAccountService } from './flikker-account.service';
import { MyFlikkerService } from './my-flikker.service';

const now = new Date('2026-10-07T20:00:00Z');
const encode = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');
const cursor = {
  businessId: 'biz-a',
  snapshot: now.toISOString(),
  at: '2026-10-07T18:00:00Z',
  id: 'visit:abc',
};
const row = {
  id: 'visit:abc',
  type: 'VISIT' as ActivityType,
  at: cursor.at,
  name: null,
  reason: null,
};
function setup() {
  const prisma = {
    customer: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'cust-a',
        business: { name: 'Café A', timezone: 'America/Montevideo' },
      }),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ total: 1n, items: [row] }]),
  };
  return {
    prisma,
    service: new PlaceActivityService(prisma as unknown as PrismaService),
  };
}

describe('Place activity: authenticated read projection', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });
  afterEach(() => jest.useRealTimers());
  it('resolves the business customer from the global account, never from request input', async () => {
    const { prisma, service } = setup();
    const result = await service.list('account-a', 'biz-a');
    expect(prisma.customer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          flikkerAccountId: 'account-a',
          businessId: 'biz-a',
          isActive: true,
        },
      }),
    );
    const query = prisma.$queryRaw.mock.calls[0][0] as Prisma.Sql;
    expect(query.values.filter((v) => v === 'cust-a').length).toBe(10);
    expect(query.values).not.toContain('account-a');
    expect(query.text).toContain('LIMIT 21');
    expect(result).toMatchObject({
      total: 1,
      nextCursor: null,
      timezone: 'America/Montevideo',
    });
    expect(result.items[0]).not.toHaveProperty('customerId');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
  it('does not reveal or query another account’s business', async () => {
    const { prisma, service } = setup();
    prisma.customer.findFirst.mockResolvedValue(null);
    await expect(service.list('account-b', 'biz-a')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
  it('returns an empty page and the real zero total', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw.mockResolvedValue([{ total: 0n, items: [] }]);
    expect(await service.list('account-a', 'biz-a')).toMatchObject({
      items: [],
      total: 0,
      nextCursor: null,
    });
  });
  it('keeps total independent of page length and retains the snapshot in the cursor', async () => {
    const { prisma, service } = setup();
    const rows = Array.from({ length: 21 }, (_, i) => ({
      ...row,
      id: `visit:${i.toString().padStart(2, '0')}`,
    }));
    prisma.$queryRaw.mockResolvedValue([{ total: 47n, items: rows }]);
    const result = await service.list('account-a', 'biz-a', encode(cursor));
    expect(result.items).toHaveLength(20);
    expect(result.total).toBe(47);
    expect(
      JSON.parse(Buffer.from(result.nextCursor!, 'base64url').toString()),
    ).toEqual({ ...cursor, at: rows[19].at, id: rows[19].id });
    const query = prisma.$queryRaw.mock.calls[0][0] as Prisma.Sql;
    expect(query.text).toContain('ORDER BY at DESC, id COLLATE "C" ASC');
    expect(query.text).toContain('AND id COLLATE "C" >');
    expect(query.values).toContain(cursor.id);
  });
  it.each([
    'VISIT',
    'STAMP_EARNED',
    'BENEFIT_UNLOCKED',
    'BENEFIT_REDEEMED',
    'BENEFIT_EXPIRED',
    'MISSION_COMPLETED',
    'FEEDBACK_SENT',
  ] as ActivityType[])(
    'maps %s without making up progress or leaking record metadata',
    (type) => {
      const event = presentActivity(
        { ...row, type, name: 'Un café', reason: null },
        'Café A',
      );
      expect(event.title).toBeTruthy();
      expect(event.occurredAt).toBe('2026-10-07T18:00:00.000Z');
      expect(Object.keys(event)).toEqual([
        'id',
        'type',
        'occurredAt',
        'title',
        'description',
      ]);
    },
  );
  it('uses a persisted bonus reason but never invents a duplicate-scan cause', () => {
    expect(
      presentActivity(
        { ...row, type: 'STAMP_EARNED', reason: 'feedback_completed' },
        'A',
      ).description,
    ).toBe('Por compartir tu opinión');
    expect(presentActivity(row, 'A').description).toBe('Visitaste A');
  });
  it('requires a live global session before resolving history', async () => {
    const accounts = {
      resolveSession: jest.fn().mockResolvedValue(null),
      syncLinkedCustomers: jest.fn(),
    };
    const activity = { list: jest.fn() };
    const controller = new MyFlikkerController(
      accounts as unknown as FlikkerAccountService,
      {} as MyFlikkerService,
      activity as unknown as PlaceActivityService,
    );
    await expect(controller.placeActivity('biz-a', undefined)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(activity.list).not.toHaveBeenCalled();
    accounts.resolveSession.mockResolvedValue({
      flikkerAccountId: 'account-a',
    });
    await controller.placeActivity('biz-a', 'verified-session', 'cursor');
    expect(accounts.syncLinkedCustomers).toHaveBeenCalledWith('account-a');
    expect(activity.list).toHaveBeenCalledWith('account-a', 'biz-a', 'cursor');
  });
});

describe('Activity cursor validation', () => {
  it('accepts valid stable keyset coordinates', () =>
    expect(parseActivityCursor(encode(cursor), 'biz-a', now)).toEqual(cursor));
  it.each([
    'garbage',
    encode({ ...cursor, businessId: 'biz-b' }),
    encode({ ...cursor, snapshot: 'invalid' }),
    encode({ ...cursor, at: '2027-01-01' }),
    encode({ ...cursor, snapshot: '2027-01-01' }),
    encode({ ...cursor, id: 42 }),
    'a'.repeat(1201),
  ])('rejects malformed, future or cross-business cursors', (value) => {
    expect(() => parseActivityCursor(value, 'biz-a', now)).toThrow(
      BadRequestException,
    );
  });
});
