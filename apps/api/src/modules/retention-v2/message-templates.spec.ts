import { RetentionObjective, RetentionStrategyType } from '@prisma/client';
import {
  buildRetentionMessage,
  type MessageContext,
} from './message-templates';

function ctx(overrides: Partial<MessageContext> = {}): MessageContext {
  return {
    customerName: 'Ana Pérez',
    businessName: 'Café Uno',
    objective: RetentionObjective.AT_RISK_RECOVERY,
    strategyType: RetentionStrategyType.REMINDER,
    incentiveLabel: null,
    expiresInDays: null,
    ...overrides,
  };
}

describe('buildRetentionMessage', () => {
  it('refuses to write copy for CONTROL — it must never be sendable', () => {
    expect(() =>
      buildRetentionMessage(
        ctx({ strategyType: RetentionStrategyType.CONTROL }),
      ),
    ).toThrow('CONTROL assignments must never produce a message');
  });

  it('greets by first name only', () => {
    const body = buildRetentionMessage(ctx());
    expect(body).toContain('Hola Ana,');
    expect(body).not.toContain('Pérez');
  });

  it('falls back to a plain greeting when there is no name', () => {
    expect(buildRetentionMessage(ctx({ customerName: null }))).toContain(
      'Hola,',
    );
    expect(buildRetentionMessage(ctx({ customerName: '   ' }))).toContain(
      'Hola,',
    );
  });

  it('always names the business', () => {
    expect(buildRetentionMessage(ctx())).toContain('Café Uno');
  });

  describe('check-in nudge', () => {
    it('invites scanning to SEE benefits when there is no incentive', () => {
      const body = buildRetentionMessage(ctx());
      expect(body).toContain('escaneá el QR del local para ver tus beneficios');
    });

    it('invites scanning to ACTIVATE when there is an incentive', () => {
      const body = buildRetentionMessage(
        ctx({
          strategyType: RetentionStrategyType.SOFT_BENEFIT,
          incentiveLabel: 'Upgrade gratis',
        }),
      );
      expect(body).toContain('escaneá el QR del local para activarlo');
    });

    it('never frames scanning as tracking', () => {
      const bodies = [
        buildRetentionMessage(ctx()),
        buildRetentionMessage(
          ctx({
            strategyType: RetentionStrategyType.STRONG_BENEFIT,
            incentiveLabel: '15% OFF',
            expiresInDays: 7,
          }),
        ),
      ];
      for (const body of bodies) {
        expect(body.toLowerCase()).not.toContain('trackear');
        expect(body.toLowerCase()).not.toContain('registrar tu retorno');
      }
    });
  });

  describe('incentives', () => {
    it('states the authorized label verbatim', () => {
      const body = buildRetentionMessage(
        ctx({
          strategyType: RetentionStrategyType.STRONG_BENEFIT,
          incentiveLabel: '15% OFF',
          expiresInDays: 7,
        }),
      );
      expect(body).toContain('*15% OFF*');
    });

    it('mentions no incentive for a REMINDER even if a label leaks in', () => {
      // REMINDER is "no benefit" by definition — the copy must not promise one.
      const body = buildRetentionMessage(
        ctx({
          strategyType: RetentionStrategyType.REMINDER,
          incentiveLabel: '10% OFF',
        }),
      );
      expect(body).not.toContain('10% OFF');
      expect(body).toContain('¡Nos encantaría verte de nuevo!');
    });

    it('renders the expiry when there is one', () => {
      expect(
        buildRetentionMessage(
          ctx({
            strategyType: RetentionStrategyType.SOFT_BENEFIT,
            incentiveLabel: 'Upgrade gratis',
            expiresInDays: 7,
          }),
        ),
      ).toContain('próximos 7 días');

      expect(
        buildRetentionMessage(
          ctx({
            strategyType: RetentionStrategyType.SOFT_BENEFIT,
            incentiveLabel: 'Upgrade gratis',
            expiresInDays: 1,
          }),
        ),
      ).toContain('válido solo por hoy');
    });

    it('omits the expiry clause when there is none', () => {
      const body = buildRetentionMessage(
        ctx({
          strategyType: RetentionStrategyType.SOFT_BENEFIT,
          incentiveLabel: 'Upgrade gratis',
          expiresInDays: null,
        }),
      );
      // Targets the expiry wording specifically — "días" alone also appears in
      // the "hace unos días" opener, which is unrelated.
      expect(body).not.toContain('Lo podés usar');
      expect(body).not.toContain('válido solo por hoy');
    });
  });

  describe('objectives read differently', () => {
    it('does not tell a first-timer they have been missed', () => {
      const body = buildRetentionMessage(
        ctx({ objective: RetentionObjective.SECOND_VISIT }),
      );
      expect(body).toContain('gracias por haber pasado');
      expect(body).not.toContain('no te vemos');
    });

    it('uses a softer line for AT_RISK than for INACTIVE', () => {
      const atRisk = buildRetentionMessage(
        ctx({ objective: RetentionObjective.AT_RISK_RECOVERY }),
      );
      const inactive = buildRetentionMessage(
        ctx({ objective: RetentionObjective.INACTIVE_RECOVERY }),
      );
      expect(atRisk).toContain('hace unos días');
      expect(inactive).toContain('hace bastante');
    });
  });
});
