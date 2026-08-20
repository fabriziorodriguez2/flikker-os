/**
 * Base fija de "cómo uso Flikker" — el asistente NUNCA genera esta
 * respuesta con el modelo: clasifica la pregunta a uno de estos ids fijos
 * (`AiGenerateRequest.schema` restringe el resultado a este enum) y el
 * backend devuelve el texto tal cual. Cero riesgo de que se invente un
 * botón, una sección o una feature que no existe — las rutas de acá están
 * verificadas contra el sidebar real (`apps/web/app/(panel)/sidebar.tsx`,
 * `CHECKIN_V2_NAV`) al momento de escribir esto.
 */

export interface HelpFaqEntry {
  id: string;
  /** Pregunta "canónica" — también se usa como chip sugerido. */
  question: string;
  answer: string;
}

export const HELP_FAQ_ENTRIES: HelpFaqEntry[] = [
  {
    id: 'create-benefit',
    question: '¿Cómo creo un beneficio?',
    answer:
      'Programa → Beneficios → "Nuevo beneficio". Ahí elegís el tipo (descuento, regalo, sorteo, etc.), el título y las condiciones.',
  },
  {
    id: 'activate-stamps',
    question: '¿Cómo activo una tarjeta de sellos?',
    answer:
      'Programa → Configuración → Configurar sellos. Ahí activás la tarjeta y elegís cuántas visitas hacen falta y cuál es la recompensa.',
  },
  {
    id: 'change-stamps-count',
    question: '¿Cómo cambio de 5 a 8 sellos?',
    answer:
      'En el mismo lugar que la activaste: Programa → Configuración → Configurar sellos. Ahí podés cambiar la cantidad de sellos requeridos en cualquier momento.',
  },
  {
    id: 'send-promotion',
    question: '¿Cómo mando una promoción?',
    answer:
      'Notificaciones → Promociones. Elegís la audiencia (todos, los que volvieron, los ausentes, los que están cerca de completar la tarjeta), escribís el mensaje y, si querés, adjuntás un beneficio del catálogo.',
  },
  {
    id: 'connect-google',
    question: '¿Cómo conecto Google?',
    answer:
      'Reseñas → Conectar Google. Buscás tu negocio y lo vinculás — desde ahí Flikker empieza a traer tus reseñas y tu rating reales.',
  },
  {
    id: 'add-qr',
    question: '¿Cómo agrego el QR?',
    answer:
      'QR y NFC. Ahí generás y descargás el QR de tu negocio para imprimirlo o pegarlo en el mostrador.',
  },
  {
    id: 'we-miss-you',
    question: '¿Cómo funciona "Te extrañamos"?',
    answer:
      'Es una automatización de reactivación: Notificaciones → Automatizaciones. Ahí también está el horario en el que se permite mandar estos mensajes.',
  },
  {
    id: 'message-schedule',
    question: '¿Dónde cambio el horario de mensajes?',
    answer:
      'Notificaciones → Automatizaciones — ahí está el horario permitido de envío.',
  },
  {
    id: 'redeem-reward',
    question: '¿Cómo canjea un cliente un premio?',
    answer:
      'El cliente te muestra el QR de su beneficio o recompensa desde su teléfono. Vos lo abrís con la cámara nativa del teléfono (no hace falta ninguna app) — te lleva directo a la pantalla de canje, donde confirmás.',
  },
  {
    id: 'authorize-benefit-reactivation',
    question: '¿Cómo autorizo un beneficio para reactivación?',
    answer:
      'Programa → Beneficios → elegís el beneficio → activás "Recuperación". A partir de ahí, ese beneficio puede usarse en reactivaciones automáticas.',
  },
  {
    id: 'view-customers',
    question: '¿Cómo veo mis clientes?',
    answer:
      'Clientes. Ahí está el listado completo, con quién volvió, quién está cerca de completar la tarjeta y quién tiene una recompensa esperando.',
  },
  {
    id: 'upgrade-to-pro',
    question: '¿Cómo paso a Pro?',
    answer:
      'Configuración → Suscripción. Ahí ves tu plan actual y podés actualizar a Pro.',
  },
];

export const HELP_FAQ_IDS = HELP_FAQ_ENTRIES.map((e) => e.id);

export function findHelpFaqEntry(id: string): HelpFaqEntry | null {
  return HELP_FAQ_ENTRIES.find((e) => e.id === id) ?? null;
}

/** Subconjunto fijo para los chips iniciales — respuesta instantánea, sin IA. */
export const SUGGESTED_QUESTION_IDS = [
  'create-benefit',
  'activate-stamps',
  'send-promotion',
  'connect-google',
] as const;
