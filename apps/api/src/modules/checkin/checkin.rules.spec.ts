import { VisitAttributionType } from '@prisma/client';
import {
  evaluateDedup,
  resolveAttribution,
  type CandidateMessage,
} from './checkin.rules';

const now = new Date('2026-08-01T18:00:00.000Z');

describe('evaluateDedup', () => {
  it('allows the first visit (no prior visit, none today)', () => {
    expect(
      evaluateDedup({
        lastVisitAt: null,
        visitsToday: 0,
        now,
        minHoursBetweenVisits: 8,
        maxVisitsPerDay: 1,
      }),
    ).toEqual({ allowed: true });
  });

  it('blocks a visit within the minimum hours window', () => {
    const lastVisitAt = new Date(now.getTime() - 2 * 3_600_000); // 2h ago
    expect(
      evaluateDedup({
        lastVisitAt,
        visitsToday: 0,
        now,
        minHoursBetweenVisits: 8,
        maxVisitsPerDay: 5,
      }),
    ).toEqual({ allowed: false, reason: 'min_hours' });
  });

  it('allows a visit once the minimum hours window has passed', () => {
    const lastVisitAt = new Date(now.getTime() - 9 * 3_600_000); // 9h ago
    expect(
      evaluateDedup({
        lastVisitAt,
        visitsToday: 0,
        now,
        minHoursBetweenVisits: 8,
        maxVisitsPerDay: 5,
      }),
    ).toEqual({ allowed: true });
  });

  it('blocks when the per-day cap is reached (even after the hours window)', () => {
    const lastVisitAt = new Date(now.getTime() - 20 * 3_600_000); // 20h ago
    expect(
      evaluateDedup({
        lastVisitAt,
        visitsToday: 1,
        now,
        minHoursBetweenVisits: 8,
        maxVisitsPerDay: 1,
      }),
    ).toEqual({ allowed: false, reason: 'max_per_day' });
  });
});

describe('resolveAttribution', () => {
  it('returns organic when there are no candidate messages', () => {
    expect(resolveAttribution([])).toEqual({
      attributionType: VisitAttributionType.organic,
      messageId: null,
      campaignId: null,
    });
  });

  it('prefers a clicked message over a more recently sent one', () => {
    const candidates: CandidateMessage[] = [
      {
        id: 'm-sent-recent',
        campaignId: 'c1',
        sentAt: new Date('2026-07-31T00:00:00Z'),
        clickedAt: null,
      },
      {
        id: 'm-clicked',
        campaignId: 'c2',
        sentAt: new Date('2026-07-20T00:00:00Z'),
        clickedAt: new Date('2026-07-21T00:00:00Z'),
      },
    ];
    expect(resolveAttribution(candidates)).toEqual({
      attributionType: VisitAttributionType.post_campaign_checkin,
      messageId: 'm-clicked',
      campaignId: 'c2',
    });
  });

  it('falls back to the most recently sent message when none were clicked', () => {
    const candidates: CandidateMessage[] = [
      {
        id: 'm-old',
        campaignId: 'c1',
        sentAt: new Date('2026-07-10T00:00:00Z'),
        clickedAt: null,
      },
      {
        id: 'm-new',
        campaignId: 'c2',
        sentAt: new Date('2026-07-28T00:00:00Z'),
        clickedAt: null,
      },
    ];
    expect(resolveAttribution(candidates)).toEqual({
      attributionType: VisitAttributionType.post_campaign_checkin,
      messageId: 'm-new',
      campaignId: 'c2',
    });
  });

  it('carries a null campaignId (retention message with no campaign)', () => {
    const candidates: CandidateMessage[] = [
      {
        id: 'm-retention',
        campaignId: null,
        sentAt: new Date('2026-07-28T00:00:00Z'),
        clickedAt: null,
      },
    ];
    expect(resolveAttribution(candidates)).toEqual({
      attributionType: VisitAttributionType.post_campaign_checkin,
      messageId: 'm-retention',
      campaignId: null,
    });
  });
});
