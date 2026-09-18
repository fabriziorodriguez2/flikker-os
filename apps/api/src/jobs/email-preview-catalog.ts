import {
  buildPasswordResetEmail,
  buildVerificationEmail,
} from './auth-email-templates';
import {
  birthdayEmail,
  promotionEmail,
  retentionMessageEmail,
  stampsExpiryEmail,
} from './email-templates';
import {
  renderFirstMonthEmail,
  renderFirstWeekEmail,
  renderMonthlySummaryEmail,
  renderTrialEndingEmail,
  renderWeeklySummaryEmail,
} from './owner-lifecycle-email-templates';
import {
  renderLowFeedbackEmail,
  renderWeeklySummaryEmail as renderLegacyWeeklySummaryEmail,
} from './workers/owner-notifications.worker';

export interface EmailPreview {
  slug: string;
  family: 'seguridad' | 'clientes' | 'operación' | 'onboarding' | 'upgrade';
  name: string;
  subject: string;
  html: string;
}

export function buildEmailPreviewCatalog(): EmailPreview[] {
  const appUrl = 'https://app.flikker.com';
  const businessName = 'Café Magnolia';
  const withResult = (
    slug: string,
    family: EmailPreview['family'],
    name: string,
    result: { subject: string; html: string },
  ): EmailPreview => ({ slug, family, name, ...result });

  return [
    {
      slug: '01-verificacion-cuenta',
      family: 'seguridad',
      name: 'Verificación de cuenta',
      subject: 'Confirmá tu cuenta de Flikker',
      html: buildVerificationEmail({
        firstName: 'Sofía',
        verifyUrl: `${appUrl}/verify-email?token=preview`,
        expiresInHours: 48,
      }),
    },
    {
      slug: '02-recuperacion-contrasena',
      family: 'seguridad',
      name: 'Recuperación de contraseña',
      subject: 'Recuperá tu contraseña de Flikker',
      html: buildPasswordResetEmail({
        firstName: 'Sofía',
        resetUrl: `${appUrl}/reset-password?token=preview`,
        expiresInMinutes: 30,
      }),
    },
    withResult(
      '03-premio-por-vencer',
      'clientes',
      'Premio por vencer',
      stampsExpiryEmail({
        businessName,
        customerName: 'Martina',
        rewardName: 'Un café de especialidad',
        daysRemaining: 2,
        redemptionCode: 'MAG-2481',
      }),
    ),
    withResult(
      '04-progreso-tarjeta',
      'clientes',
      'Progreso de tarjeta',
      retentionMessageEmail({
        businessName,
        customerName: 'Martina',
        messageBody:
          'Te falta una sola visita para completar tu tarjeta y desbloquear tu próximo premio.',
        isProgressReminder: true,
      }),
    ),
    withResult(
      '05-reactivacion',
      'clientes',
      'Reactivación de cliente',
      retentionMessageEmail({
        businessName,
        customerName: 'Martina',
        messageBody:
          'Hace un tiempo que no te vemos. Tu tarjeta y tus beneficios siguen esperándote.',
        isProgressReminder: false,
      }),
    ),
    withResult(
      '06-cumpleanos',
      'clientes',
      'Cumpleaños',
      birthdayEmail({ businessName, customerName: 'Martina' }),
    ),
    withResult(
      '07-promocion-manual',
      'clientes',
      'Promoción manual',
      promotionEmail({
        businessName,
        customerName: 'Martina',
        messageBody:
          'Esta semana preparamos una propuesta especial para quienes ya son parte de nuestra comunidad.',
        benefitTitle: '20% en tu próxima merienda',
        checkinLink: `${appUrl}/cafe-magnolia`,
      }),
    ),
    withResult(
      '08-primera-semana',
      'onboarding',
      'Primera semana · con actividad',
      renderFirstWeekEmail({
        businessName,
        newCustomers: 28,
        visits: 43,
        returningCustomers: 11,
        newReviews: 8,
        benefitsRedeemed: 3,
        lowActivity: false,
      }),
    ),
    withResult(
      '09-primera-semana-sin-data',
      'onboarding',
      'Primera semana · poca actividad',
      renderFirstWeekEmail({
        businessName,
        newCustomers: 1,
        visits: 1,
        returningCustomers: 0,
        newReviews: 0,
        benefitsRedeemed: 0,
        lowActivity: true,
      }),
    ),
    withResult(
      '10-resumen-semanal-v2',
      'operación',
      'Resumen semanal · Check-in V2',
      renderWeeklySummaryEmail({
        businessName,
        funnel: { contacted: 24, returned: 7, recoveryRatePercent: 29.2 },
        kpis: [
          { label: 'Visitas', value: 72 },
          { label: 'Clientes nuevos', value: 19 },
          { label: 'Reseñas nuevas', value: 12 },
          { label: 'Beneficios canjeados', value: 6 },
        ],
        aiText:
          'La recurrencia creció esta semana. Mantené activa la campaña para clientes que llevan más de 21 días sin volver.',
      }),
    ),
    withResult(
      '11-resumen-mensual',
      'operación',
      'Resumen mensual',
      renderMonthlySummaryEmail({
        businessName,
        monthLabel: 'agosto de 2026',
        returningCustomers: 48,
        recoveredCustomers: 13,
        newCustomers: 76,
        newReviews: 31,
        benefitsRedeemed: 18,
        comparison: { newCustomers: 62, returningCustomers: 39 },
        aiText:
          'Las visitas recurrentes crecieron frente al mes anterior y las reseñas mantuvieron un ritmo saludable.',
      }),
    ),
    withResult(
      '12-primer-mes',
      'onboarding',
      'Primer mes',
      renderFirstMonthEmail({
        businessName,
        registeredCustomers: 93,
        returningCustomers: 34,
        recoveredCustomers: 9,
        benefitsRedeemed: 14,
        reviewsSinceFlikker: 27,
      }),
    ),
    withResult(
      '13-fin-de-prueba',
      'upgrade',
      'Fin de prueba Pro',
      renderTrialEndingEmail({
        businessName,
        daysRemaining: 2,
        registeredCustomers: 93,
        returningCustomers: 34,
        recoveredCustomers: 9,
        benefitsRedeemed: 14,
      }),
    ),
    {
      slug: '14-feedback-bajo',
      family: 'operación',
      name: 'Feedback bajo',
      subject: `Feedback bajo (2/5) - ${businessName}`,
      html: renderLowFeedbackEmail({
        businessName,
        customerName: 'Martina',
        score: 2,
        comment:
          'La atención fue amable, pero esperamos demasiado para recibir el pedido.',
        panelUrl: `${appUrl}/dashboard?feedback=preview`,
      }),
    },
    {
      slug: '15-resumen-semanal-legacy',
      family: 'operación',
      name: 'Resumen semanal · Legacy',
      subject: `Resumen semanal de ${businessName}`,
      html: renderLegacyWeeklySummaryEmail({
        businessName,
        current: { reviewsGenerated: 9, averageRating: 4.7, qrScans: 58 },
        previous: { reviewsGenerated: 6, averageRating: 4.6, qrScans: 41 },
        panelUrl: `${appUrl}/dashboard`,
      }),
    },
  ];
}
