import { RetentionObjective, RetentionStrategyType } from '@prisma/client';

/**
 * Deterministic message copy. No AI yet — and even once AI lands, this stays as
 * the fallback, because a generation failure must never stop a send.
 *
 * Hard rule: the amount, the percentage and the expiry are injected here from
 * the authorized catalogue row. Generated prose may never introduce or alter a
 * commercial term.
 */

export interface MessageContext {
  customerName: string | null;
  businessName: string;
  objective: RetentionObjective;
  strategyType: RetentionStrategyType;
  /** Label of the authorized incentive, e.g. "10% OFF". Null for REMINDER. */
  incentiveLabel: string | null;
  /** Days the reward stays valid, when there is one. */
  expiresInDays: number | null;
  /**
   * Required (and only meaningful) for PROGRESS_REMINDER (Fase E §25/§28):
   * reminds the customer of a Reward Goal that already existed — this never
   * issues a new incentive, so there is no `incentiveLabel`/`expiresInDays`
   * for it.
   */
  progressReminder?: { remainingVisits: number; rewardName: string };
}

/** First name only — friendlier, and avoids echoing a full record back. */
function firstName(name: string | null): string | null {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0];
}

function greeting(customerName: string | null): string {
  const name = firstName(customerName);
  return name ? `Hola ${name}` : 'Hola';
}

/**
 * The check-in nudge. Framed as what the customer gets — seeing or activating
 * their benefit — never as "so we can track you".
 */
function checkinNudge(hasIncentive: boolean): string {
  return hasIncentive
    ? 'Cuando vengas, escaneá el QR del local para activarlo.'
    : 'Cuando vuelvas, escaneá el QR del local para ver tus beneficios.';
}

function expiryClause(expiresInDays: number | null): string {
  if (!expiresInDays || expiresInDays <= 0) return '';
  if (expiresInDays === 1) return ' Es válido solo por hoy.';
  return ` Lo podés usar durante los próximos ${expiresInDays} días.`;
}

/** Opening line, by what we are trying to achieve. */
function openingLine(
  objective: RetentionObjective,
  businessName: string,
): string {
  switch (objective) {
    case RetentionObjective.SECOND_VISIT:
      // A first-timer is not "missed" — they were simply here once.
      return `gracias por haber pasado por *${businessName}*.`;
    case RetentionObjective.AT_RISK_RECOVERY:
      return `hace unos días que no te vemos por *${businessName}*.`;
    case RetentionObjective.INACTIVE_RECOVERY:
      return `hace bastante que no pasás por *${businessName}*.`;
    case RetentionObjective.REWARD_GOAL_PROGRESS:
      // Unreachable in practice: a REWARD_GOAL_PROGRESS experiment only ever
      // allows CONTROL (throws above, before this is called) or
      // PROGRESS_REMINDER (returns via buildProgressReminderMessage before
      // this is called) — see RetentionExperimentsAdminService's
      // validateStrategyForObjective. Kept explicit rather than a silent
      // fallthrough, same as CONTROL above.
      throw new Error(
        'openingLine is never used for REWARD_GOAL_PROGRESS — PROGRESS_REMINDER and CONTROL both short-circuit before this call',
      );
  }
}

/**
 * Builds the message body.
 *
 * CONTROL never produces copy: it exists precisely so that nothing is sent.
 * Asking for its text is a programming error, so it throws instead of silently
 * returning something sendable.
 */
export function buildRetentionMessage(context: MessageContext): string {
  if (context.strategyType === RetentionStrategyType.CONTROL) {
    throw new Error('CONTROL assignments must never produce a message');
  }

  if (context.strategyType === RetentionStrategyType.PROGRESS_REMINDER) {
    if (!context.progressReminder) {
      throw new Error('PROGRESS_REMINDER requires progress data');
    }
    return buildProgressReminderMessage(
      context.customerName,
      context.businessName,
      context.progressReminder,
    );
  }

  const hasIncentive =
    context.strategyType !== RetentionStrategyType.REMINDER &&
    Boolean(context.incentiveLabel);

  const parts = [
    `${greeting(context.customerName)}, ${openingLine(
      context.objective,
      context.businessName,
    )}`,
  ];

  if (hasIncentive) {
    parts.push(
      `Te dejamos esto para tu próxima visita: *${context.incentiveLabel}*.${expiryClause(
        context.expiresInDays,
      )}`,
    );
  } else {
    parts.push('¡Nos encantaría verte de nuevo!');
  }

  parts.push(checkinNudge(hasIncentive));

  return parts.join('\n');
}

/**
 * Fase E §25/§28: reminds the customer of progress that already existed —
 * never issues anything, never invents urgency (§29: no "última oportunidad",
 * no manufactured scarcity — only what is literally true about the goal).
 */
function buildProgressReminderMessage(
  customerName: string | null,
  businessName: string,
  progress: { remainingVisits: number; rewardName: string },
): string {
  const { remainingVisits, rewardName } = progress;
  const visitsClause =
    remainingVisits === 1
      ? 'Te falta una visita'
      : remainingVisits === 2
        ? 'Estás a dos visitas'
        : `Te faltan ${remainingVisits} visitas`;

  return [
    `${greeting(customerName)},`,
    `${visitsClause} para desbloquear *${rewardName}* en *${businessName}*.`,
    'Cuando vuelvas, escaneá el QR/NFC para avanzar.',
  ].join('\n');
}
