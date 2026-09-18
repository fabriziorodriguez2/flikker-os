import { buildMiFlikkerLink } from '../modules/public/public-messaging.service';
import {
  emailCallout,
  emailCode,
  emailParagraph,
  escapeHtml,
  renderEmailLayout,
} from './email-design-system';

/** Free — el premio de la tarjeta de sellos está por vencer sin canjear. */
export function stampsExpiryEmail(input: {
  businessName: string;
  customerName: string;
  rewardName: string;
  daysRemaining: number;
  redemptionCode: string;
}) {
  const dayWord = input.daysRemaining === 1 ? 'día' : 'días';
  return {
    subject: `Tu premio en ${input.businessName} vence en ${input.daysRemaining} ${dayWord}`,
    html: renderEmailLayout({
      preheader: `Tenés ${input.daysRemaining} ${dayWord} para canjear ${input.rewardName}.`,
      eyebrow: input.businessName,
      title: 'Tu premio está por vencer',
      bodyHtml:
        emailParagraph(`¡Hola ${escapeHtml(input.customerName)}!`) +
        emailParagraph(
          `Completaste tu tarjeta y ganaste <strong>${escapeHtml(input.rewardName)}</strong>. Todavía no lo canjeaste y vence en <strong>${input.daysRemaining} ${dayWord}</strong>.`,
        ) +
        emailCode(input.redemptionCode) +
        emailParagraph(
          'Mostrá este código en el mostrador para canjear tu premio.',
          { muted: true, small: true },
        ),
      businessName: input.businessName,
      customerFacing: true,
    }),
  };
}

export function stampsExpiryWhatsAppText(input: {
  customerName: string;
  rewardName: string;
  daysRemaining: number;
  redemptionCode: string;
}): string {
  const dayWord = input.daysRemaining === 1 ? 'día' : 'días';
  return `¡Hola ${input.customerName}! Ganaste ${input.rewardName} con tu tarjeta y todavía no lo canjeaste — vence en ${input.daysRemaining} ${dayWord}.\n\nMostrá este código para canjearlo: ${input.redemptionCode}`;
}

export function rewardGoalUnlockedWhatsAppText(input: {
  customerName: string;
  rewardName: string;
  benefitLink: string;
}): string {
  return `🎉 ¡Completaste tu tarjeta, ${input.customerName}! Ya tenés disponible ${input.rewardName}.\n\nCuando vengas, mostrale tu QR al personal para canjearlo: ${input.benefitLink}\n\nVas todos tus premios y lugares en Mi Flikker: ${buildMiFlikkerLink()}`;
}

export function birthdayWhatsAppText(input: {
  businessName: string;
  customerName: string;
}): string {
  return `¡Feliz cumpleaños, ${input.customerName}! 🎉 Todo el equipo de ${input.businessName} te desea un muy feliz día.`;
}

/** Pro — misma decisión y mensaje aprobado por Retention V2, en canal email. */
export function retentionMessageEmail(input: {
  businessName: string;
  customerName: string;
  messageBody: string;
  isProgressReminder: boolean;
}) {
  const title = input.isProgressReminder
    ? 'Ya casi completás tu tarjeta'
    : `Te extrañamos en ${input.businessName}`;
  return {
    subject: input.isProgressReminder
      ? '¡Ya casi completás tu tarjeta!'
      : `Te extrañamos en ${input.businessName}`,
    html: renderEmailLayout({
      preheader: input.isProgressReminder
        ? `Mirá cuánto te falta para tu próximo premio en ${input.businessName}.`
        : `${input.businessName} tiene novedades para vos.`,
      eyebrow: input.businessName,
      title,
      bodyHtml:
        emailParagraph(`Hola ${escapeHtml(input.customerName)},`) +
        emailCallout({
          tone: input.isProgressReminder ? 'accent' : 'neutral',
          contentHtml: escapeHtml(input.messageBody).replaceAll('\n', '<br />'),
        }),
      action: { label: 'Ver mis premios', url: buildMiFlikkerLink() },
      businessName: input.businessName,
      customerFacing: true,
    }),
  };
}

export function birthdayEmail(input: {
  businessName: string;
  customerName: string;
}) {
  return {
    subject: `¡Feliz cumpleaños de parte de ${input.businessName}!`,
    html: renderEmailLayout({
      preheader: `${input.businessName} tiene un saludo especial para vos.`,
      eyebrow: input.businessName,
      title: `¡Feliz cumpleaños, ${input.customerName}!`,
      bodyHtml:
        emailParagraph(
          `Todo el equipo de <strong>${escapeHtml(input.businessName)}</strong> te desea un muy feliz día.`,
        ) +
        emailCallout({
          tone: 'success',
          contentHtml:
            'Gracias por elegirnos y dejarnos ser parte de tus momentos.',
        }),
      businessName: input.businessName,
      customerFacing: true,
    }),
  };
}

export function promotionEmail(input: {
  businessName: string;
  customerName: string;
  messageBody: string;
  benefitTitle: string | null;
  checkinLink: string | null;
}) {
  return {
    subject: `Novedades de ${input.businessName}`,
    html: renderEmailLayout({
      preheader: input.benefitTitle
        ? `${input.businessName}: ${input.benefitTitle}`
        : `${input.businessName} tiene novedades para vos.`,
      eyebrow: input.businessName,
      title: 'Tenemos algo para vos',
      bodyHtml:
        emailParagraph(`Hola ${escapeHtml(input.customerName)},`) +
        emailParagraph(
          escapeHtml(input.messageBody).replaceAll('\n', '<br />'),
        ) +
        (input.benefitTitle
          ? emailCallout({
              label: 'Tu beneficio',
              tone: 'success',
              contentHtml: `<strong>${escapeHtml(input.benefitTitle)}</strong>`,
            })
          : ''),
      action: input.checkinLink
        ? { label: 'Ver mi beneficio', url: input.checkinLink }
        : { label: 'Ir a Mi Flikker', url: buildMiFlikkerLink() },
      businessName: input.businessName,
      customerFacing: true,
    }),
  };
}
