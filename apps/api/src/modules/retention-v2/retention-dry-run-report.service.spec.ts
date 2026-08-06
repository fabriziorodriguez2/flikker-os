import { RetentionDryRunReportService } from './retention-dry-run-report.service';

const NOW = new Date('2026-09-02T18:00:00.000Z'); // Wednesday 15:00 Montevideo

function makePrisma(logs: unknown[] = [], timezone = 'America/Montevideo') {
  return {
    business: { findUnique: jest.fn().mockResolvedValue({ timezone }) },
    retentionDecisionLog: { findMany: jest.fn().mockResolvedValue(logs) },
  };
}

function log(decisionCode: string, customerId: string, createdAt = NOW) {
  return { decisionCode, customerId, createdAt };
}

describe('RetentionDryRunReportService.today — Fase C.5 §9', () => {
  it('reports zeros for a quiet day', async () => {
    const prisma = makePrisma([]);
    const service = new RetentionDryRunReportService(prisma as never);

    const report = await service.today('biz-1', NOW);

    expect(report).toEqual({
      date: '2026-09-02',
      analyzed: 0,
      detectedAtRisk: 0,
      wouldControl: 0,
      wouldSend: 0,
      wouldOfferIncentive: 0,
    });
  });

  it('matches the panel example: control + reminders + incentives sum to detected', async () => {
    const prisma = makePrisma([
      log('DRY_RUN_WOULD_CONTROL', 'c1'),
      log('DRY_RUN_WOULD_CONTROL', 'c2'),
      log('DRY_RUN_WOULD_CONTROL', 'c3'),
      ...Array.from({ length: 7 }, (_, i) =>
        log('DRY_RUN_WOULD_SEND', `r${i}`),
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        log('DRY_RUN_WOULD_OFFER_INCENTIVE', `b${i}`),
      ),
    ]);
    const service = new RetentionDryRunReportService(prisma as never);

    const report = await service.today('biz-1', NOW);

    expect(report.wouldControl).toBe(3);
    expect(report.wouldSend).toBe(7);
    expect(report.wouldOfferIncentive).toBe(4);
    expect(report.detectedAtRisk).toBe(14);
    expect(report.analyzed).toBe(14);
  });

  it('deduplicates a customer who logged more than one row', async () => {
    const prisma = makePrisma([
      log('SKIPPED_COOLDOWN', 'c1'),
      log('DRY_RUN_WOULD_SEND', 'c1'),
    ]);
    const service = new RetentionDryRunReportService(prisma as never);

    const report = await service.today('biz-1', NOW);

    expect(report.analyzed).toBe(1);
  });

  it('excludes logs from outside the local calendar day', async () => {
    const prisma = makePrisma([
      // 2026-09-02T02:00 UTC is 2026-09-01T23:00 local — yesterday.
      log('DRY_RUN_WOULD_SEND', 'c1', new Date('2026-09-02T02:00:00.000Z')),
    ]);
    const service = new RetentionDryRunReportService(prisma as never);

    const report = await service.today('biz-1', NOW);

    expect(report.wouldSend).toBe(0);
    expect(report.analyzed).toBe(0);
  });

  it('evaluates the day in the business timezone, not UTC', async () => {
    const prisma = makePrisma(
      [log('DRY_RUN_WOULD_SEND', 'c1', NOW)],
      'America/Montevideo',
    );
    const service = new RetentionDryRunReportService(prisma as never);

    const report = await service.today('biz-1', NOW);

    // 2026-09-02T18:00 UTC is 15:00 local — still September 2nd locally.
    expect(report.date).toBe('2026-09-02');
  });

  it('404s for a business that does not exist', async () => {
    const prisma = makePrisma([]);
    prisma.business.findUnique.mockResolvedValue(null);
    const service = new RetentionDryRunReportService(prisma as never);

    await expect(service.today('ghost', NOW)).rejects.toThrow(
      'Business not found',
    );
  });
});
