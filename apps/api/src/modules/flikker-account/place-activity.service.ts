import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type ActivityType =
  | 'VISIT'
  | 'STAMP_EARNED'
  | 'BENEFIT_UNLOCKED'
  | 'BENEFIT_REDEEMED'
  | 'BENEFIT_EXPIRED'
  | 'MISSION_COMPLETED'
  | 'FEEDBACK_SENT';
interface ActivityRow {
  id: string;
  type: ActivityType;
  at: string;
  name: string | null;
  reason: string | null;
}
interface Cursor {
  snapshot: string;
  at: string;
  id: string;
  businessId: string;
}

export function parseActivityCursor(
  value: string | undefined,
  businessId: string,
  now: Date,
): Cursor | null {
  if (!value) return null;
  try {
    if (value.length > 1200) throw new Error();
    const c = JSON.parse(Buffer.from(value, 'base64url').toString()) as Cursor;
    if (
      c.businessId !== businessId ||
      typeof c.id !== 'string' ||
      c.id.length > 150 ||
      !c.id ||
      typeof c.at !== 'string' ||
      typeof c.snapshot !== 'string' ||
      !Number.isFinite(Date.parse(c.at)) ||
      !Number.isFinite(Date.parse(c.snapshot)) ||
      Date.parse(c.at) > Date.parse(c.snapshot) ||
      Date.parse(c.snapshot) > now.getTime()
    )
      throw new Error();
    return c;
  } catch {
    throw new BadRequestException('Invalid activity cursor');
  }
}

export function presentActivity(row: ActivityRow, businessName: string) {
  const copy: Record<ActivityType, [string, string | null]> = {
    VISIT: ['Registraste una visita', `Visitaste ${businessName}`],
    STAMP_EARNED: [
      row.reason ? 'Sumaste 1 sello extra' : 'Sumaste 1 sello',
      row.reason === 'feedback_completed'
        ? 'Por compartir tu opinión'
        : row.reason === 'return_challenge_completed'
          ? 'Por completar el desafío de vuelta'
          : row.reason
            ? null
            : `Visitaste ${businessName}`,
    ],
    BENEFIT_UNLOCKED: ['Desbloqueaste un beneficio', row.name],
    BENEFIT_REDEEMED: ['Canjeaste tu beneficio', row.name],
    BENEFIT_EXPIRED: ['Venció tu beneficio', row.name],
    MISSION_COMPLETED: ['Completaste el desafío', row.name],
    FEEDBACK_SENT: [
      'Enviaste tu opinión',
      `Tu opinión llegó a ${businessName}`,
    ],
  };
  return {
    id: row.id,
    type: row.type,
    occurredAt: new Date(row.at).toISOString(),
    title: copy[row.type][0],
    description: copy[row.type][1],
  };
}

/** Read-only projection. No event persistence, domain mutations or per-item queries.
 * Visit credit follows the existing strictly-after-activation counting contract.
 * Terminal timestamps bound old cycles; exact historic counters are never inferred.
 */
@Injectable()
export class PlaceActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async list(accountId: string, businessId: string, cursorValue?: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { flikkerAccountId: accountId, businessId, isActive: true },
      select: {
        id: true,
        business: { select: { name: true, timezone: true } },
      },
    });
    if (!customer) throw new NotFoundException('Business not found');
    const now = new Date();
    const cursor = parseActivityCursor(cursorValue, businessId, now);
    const snapshot = cursor?.snapshot ?? now.toISOString();
    const customerId = customer.id;
    // All sources and joined tenant-owned rows are independently scoped.
    const scope = Prisma.sql`business_id = ${businessId} AND customer_id = ${customerId}`;
    const after = cursor
      ? Prisma.sql`AND (at < ${new Date(cursor.at)} OR (at = ${new Date(cursor.at)} AND id COLLATE "C" > ${cursor.id}))`
      : Prisma.empty;
    const [result] = await this.prisma.$queryRaw<
      Array<{ total: bigint; items: ActivityRow[] }>
    >(Prisma.sql`
      WITH events AS (
        SELECT 'visit:' || v.id AS id,
          'VISIT' AS type,
          v.occurred_at AS at, NULL::text AS name, NULL::text AS reason
          FROM visits v WHERE ${scope}
        UNION ALL SELECT 'bonus:' || id, 'STAMP_EARNED', created_at, NULL, reason_code
          FROM reward_goal_bonus_stamps WHERE ${scope}
        UNION ALL SELECT 'issued:' || p.id, 'BENEFIT_UNLOCKED', p.created_at, p.benefit_title_snapshot, NULL
          FROM benefit_participations p WHERE ${scope} AND redemption_code IS NOT NULL
        UNION ALL SELECT 'redeemed:' || p.id, 'BENEFIT_REDEEMED', p.redeemed_at, p.benefit_title_snapshot, NULL
          FROM benefit_participations p WHERE ${scope} AND redeemed_at IS NOT NULL
        UNION ALL SELECT 'expired:' || p.id, 'BENEFIT_EXPIRED', p.expires_at, p.benefit_title_snapshot, NULL
          FROM benefit_participations p WHERE ${scope} AND redemption_code IS NOT NULL AND redeemed_at IS NULL AND expires_at IS NOT NULL
        UNION ALL SELECT 'mission:' || cm.id, 'MISSION_COMPLETED', cm.completed_at, m.name, NULL
          FROM customer_missions cm JOIN missions m ON m.id = cm.mission_id AND m.business_id = ${businessId}
          WHERE cm.business_id = ${businessId} AND cm.customer_id = ${customerId} AND cm.completed_at IS NOT NULL
        UNION ALL SELECT 'return:' || id, 'MISSION_COMPLETED', completed_at, 'Desafío de vuelta', NULL
          FROM return_challenges WHERE ${scope} AND completed_at IS NOT NULL
        UNION ALL SELECT 'feedback:' || id, 'FEEDBACK_SENT', created_at, NULL, NULL
          FROM checkin_feedback WHERE ${scope}
        UNION ALL SELECT 'opinion:' || id, 'FEEDBACK_SENT', "createdAt", NULL, NULL
          FROM "FeedbackResponse" WHERE "businessId" = ${businessId} AND "customerId" = ${customerId}
      ), visible AS (SELECT * FROM events WHERE at <= ${new Date(snapshot)}),
      page AS (SELECT * FROM visible WHERE true ${after} ORDER BY at DESC, id COLLATE "C" ASC LIMIT 21)
      SELECT (SELECT count(*) FROM visible) AS total,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'type', CASE WHEN type = 'VISIT' THEN (          CASE WHEN EXISTS (SELECT 1 FROM customer_reward_goals g
            WHERE g.business_id = ${businessId} AND g.customer_id = ${customerId}
              AND at > g.activated_at
              AND at <= LEAST(g.unlocked_at, g.cancelled_at, g.expires_at, ${new Date(snapshot)})
              AND (g.status::text = 'ACTIVE' OR g.unlocked_at IS NOT NULL OR g.cancelled_at IS NOT NULL OR g.expires_at IS NOT NULL)
              AND (g.status::text <> 'CANCELLED' OR g.cancelled_at IS NOT NULL))
            THEN 'STAMP_EARNED' ELSE 'VISIT' END) ELSE type END, 'at', to_char(at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'name', name, 'reason', reason) ORDER BY at DESC, id COLLATE "C" ASC) FROM page), '[]'::jsonb) AS items
    `);
    const rows = result.items.slice(0, 20);
    const last = rows.at(-1);
    const nextCursor =
      result.items.length > 20 && last
        ? Buffer.from(
            JSON.stringify({ snapshot, at: last.at, id: last.id, businessId }),
          ).toString('base64url')
        : null;
    return {
      items: rows.map((row) => presentActivity(row, customer.business.name)),
      total: Number(result.total),
      nextCursor,
      timezone: customer.business.timezone,
      snapshot,
    };
  }
}
