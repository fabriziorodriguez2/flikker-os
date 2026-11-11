import { escapeHtml, getEmailAppUrl } from './email-design-system';
import {
  PRODUCT_EMAIL,
  PRODUCT_EMAIL_FOOTER,
  PRODUCT_EMAIL_SUPPORT,
  productEmailCard,
  productEmailLabel,
  productEmailParagraph,
  productEmailUrl,
  renderProductEmailLayout,
} from './product-email-layout';

/** Read-only presentation context from the business's actual subscription. */
export interface WelcomeEmailPlan {
  slug: string;
  name: string;
  maxCustomers: number | null;
}

const FIRST_STEPS = [
  'Personalizá tu tarjeta',
  'Configurá tu primer beneficio',
  'Probá tu QR',
];

function firstStepsHtml(): string {
  return productEmailCard(
    productEmailLabel('Empezá por acá') +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${FIRST_STEPS.map(
        (step, index) =>
          `<tr><td width="28" valign="top" style="padding:8px 0;font-size:15px;line-height:1.6;font-weight:bold;color:${PRODUCT_EMAIL.accent};">${index + 1}.</td><td style="padding:8px 0;font-size:15px;line-height:1.6;color:${PRODUCT_EMAIL.text};">${escapeHtml(step)}</td></tr>`,
      ).join('')}</table>`,
    PRODUCT_EMAIL.secondarySurface,
  );
}

function renderAccountWelcomeEmail(input: {
  firstName: string;
  plan?: WelcomeEmailPlan | null;
  pro?: boolean;
  businessName?: string;
  appUrl?: string;
  gettingStartedPdfUrl?: string;
}) {
  // Free is a product tier named Base in the UI. Other names come from the plan.
  const isFree = input.plan?.slug === 'free';
  const isPro =
    input.pro || ['pro', 'pro-selfservice'].includes(input.plan?.slug ?? '');
  const planName = isFree
    ? 'Plan Base'
    : isPro
      ? 'Flikker Pro'
      : input.plan?.name;
  const name = input.firstName.trim();
  const title = `${name ? `Hola ${name}, tu` : 'Tu'} negocio ya está listo${isPro ? ' en Flikker Pro' : ''}.`;
  const appUrl = input.appUrl ?? getEmailAppUrl();
  const features: string[] = [];
  if (input.plan?.maxCustomers != null) {
    features.push(`Hasta ${input.plan.maxCustomers} clientes`);
  } else if (isPro || input.plan?.maxCustomers === null) {
    features.push('Sin tope de clientes');
  }
  if (isFree) features.push('Sin tarjeta', 'Sin vencimiento');
  if (isPro) features.push('Beneficios sin límite de prueba');
  const upgradeCopy = isFree
    ? 'Cuando quieras, podés pasar a Pro desde Configuración → Suscripción.'
    : '';
  const intro = input.businessName
    ? `${input.businessName} ya tiene su espacio en Flikker. Empezá a darle a tus clientes más motivos para volver.`
    : 'Tu cuenta y tu negocio ya están listos. Empezá a darle a tus clientes más motivos para volver.';
  const planCard = planName
    ? productEmailCard(
        productEmailLabel('Tu plan') +
          `<h2 style="margin:0 0 14px;font-size:25px;line-height:1.3;color:${PRODUCT_EMAIL.text};">${escapeHtml(planName)}</h2>` +
          features
            .map(
              (feature) =>
                `<p style="margin:6px 0;font-size:15px;line-height:1.6;color:${PRODUCT_EMAIL.muted};">${escapeHtml(feature)}</p>`,
            )
            .join(''),
      )
    : '';
  const guide = input.gettingStartedPdfUrl
    ? productEmailParagraph(
        `Si necesitás más detalle, consultá la <a href="${productEmailUrl(input.gettingStartedPdfUrl)}" style="color:${PRODUCT_EMAIL.accent};text-decoration:underline;">guía de primeros pasos</a>.`,
      )
    : '';

  return {
    html: renderProductEmailLayout({
      preheader: planName
        ? `Tu negocio ya está listo en ${planName}.`
        : 'Tu cuenta y tu negocio ya están listos en Flikker.',
      eyebrow: 'Bienvenido a Flikker',
      title,
      bodyHtml:
        productEmailParagraph(escapeHtml(intro)) +
        planCard +
        (upgradeCopy ? productEmailParagraph(escapeHtml(upgradeCopy)) : ''),
      action: { label: 'Ir a Flikker', url: appUrl },
      afterActionHtml: firstStepsHtml() + guide,
      support: true,
    }),
    text: [
      'Bienvenido a Flikker',
      title,
      intro,
      planName,
      ...features,
      upgradeCopy,
      `Ir a Flikker: ${appUrl}`,
      'EMPEZÁ POR ACÁ',
      ...FIRST_STEPS.map((step, index) => `${index + 1}. ${step}`),
      input.gettingStartedPdfUrl
        ? `Guía de primeros pasos: ${input.gettingStartedPdfUrl}`
        : '',
      PRODUCT_EMAIL_SUPPORT,
      PRODUCT_EMAIL_FOOTER,
    ]
      .filter(Boolean)
      .join('\n\n'),
  };
}

/** Same sending contract and events; text is available without changing transport. */
export function renderWelcomeFreeEmail(input: {
  firstName: string;
  plan?: WelcomeEmailPlan | null;
  appUrl?: string;
}) {
  return {
    subject: 'Bienvenido a Flikker',
    ...renderAccountWelcomeEmail(input),
  };
}

export function renderWelcomeProEmail(input: {
  firstName: string;
  businessName: string;
  gettingStartedPdfUrl?: string;
  appUrl?: string;
}) {
  return {
    subject: 'Tu suscripción Pro está activa',
    ...renderAccountWelcomeEmail({ ...input, pro: true }),
  };
}
