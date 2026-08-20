/**
 * Base fija de "cómo uso Flikker" — el asistente NUNCA genera esta
 * respuesta con el modelo: se resuelve por texto determinístico
 * (`matchHelpFaqEntryByText`, prioridad 1 — nunca depende de la IA) o, si
 * eso no matchea, la IA clasifica la pregunta a uno de estos ids fijos
 * (`AiGenerateRequest.schema` restringe el resultado a este enum) y el
 * backend devuelve el texto tal cual. Cero riesgo de que se invente un
 * botón, una sección o una feature que no existe — las rutas de acá están
 * verificadas contra el código real de `apps/web/app/(panel)/dashboard/`
 * (sidebar, tabs y labels reales, no supuestos) al momento de escribir esto.
 */

export interface HelpFaqCta {
  label: string;
  href: string;
}

export interface HelpFaqEntry {
  id: string;
  /** Pregunta "canónica" — también se usa como chip sugerido. */
  question: string;
  answer: string;
  /**
   * Frases normalizadas (sin tildes, minúsculas) que identifican esta
   * pregunta sin ambigüedad — usadas por `matchHelpFaqEntryByText` antes de
   * intentar cualquier llamada a IA.
   */
  keywords: string[];
  /** CTA interno opcional — solo cuando hay una ruta real puntual a la que mandar. */
  cta?: HelpFaqCta;
}

export const HELP_FAQ_ENTRIES: HelpFaqEntry[] = [
  {
    id: 'create-benefit',
    question: '¿Cómo creo un beneficio?',
    answer:
      'Programa → Configuración → Beneficios → "Nuevo beneficio". Ahí elegís el tipo (descuento, regalo, sorteo, etc.), el título y las condiciones.',
    keywords: [
      'crear beneficio',
      'creo un beneficio',
      'nuevo beneficio',
      'como creo un beneficio',
      'agregar un beneficio',
    ],
  },
  {
    id: 'activate-stamps',
    question: '¿Cómo activo una tarjeta de sellos?',
    answer:
      'Programa → Configuración → Tarjeta digital → "Configurar sellos". Ahí activás la tarjeta y elegís cuántas visitas hacen falta y cuál es la recompensa.',
    keywords: [
      'activar tarjeta de sellos',
      'activo la tarjeta de sellos',
      'activar sellos',
      'configurar la tarjeta',
      'como configuro la tarjeta de sellos',
      'como activo los sellos',
    ],
  },
  {
    id: 'change-stamps-count',
    question: '¿Cómo cambio la cantidad de sellos?',
    answer:
      'En el mismo lugar que la activaste: Programa → Configuración → Tarjeta digital → "Configurar sellos". Ahí podés cambiar la cantidad de sellos requeridos en cualquier momento.',
    keywords: [
      'cambiar la cantidad de sellos',
      'cambiar cantidad de sellos',
      'cambio la cantidad de sellos',
      'cuantos sellos',
      'cambiar de 5 a 8 sellos',
      'aumentar los sellos',
    ],
  },
  {
    id: 'send-promotion',
    question: '¿Cómo mando una promoción?',
    answer:
      'Notificaciones → Promociones → "Crear promoción". Escribís el mensaje, elegís a quién se lo mandás (todos, los que volvieron, los ausentes, los que están cerca de completar la tarjeta) y, si querés, le sumás un beneficio del catálogo. Antes de enviarlo te muestra un resumen para que lo revises.',
    keywords: [
      'mandar una promocion',
      'mando una promocion',
      'enviar una promocion',
      'como mando una promo',
      'crear una promocion',
      'como envio una promocion',
    ],
    cta: {
      label: 'Ir a Promociones',
      href: '/dashboard/notificaciones?tab=promociones',
    },
  },
  {
    id: 'connect-google',
    question: '¿Cómo conecto Google?',
    answer:
      'Reseñas → "Buscar mi negocio en Google". Lo buscás y lo vinculás — desde ahí Flikker empieza a traer tus reseñas y tu rating reales.',
    keywords: [
      'conectar google',
      'conecto google',
      'vincular google',
      'conectar mi negocio en google',
      'buscar mi negocio en google',
    ],
    cta: { label: 'Ir a Reseñas', href: '/dashboard/reviews' },
  },
  {
    id: 'add-qr',
    question: '¿Cómo agrego el QR?',
    answer:
      'QR y NFC. Ahí generás y descargás el QR de tu negocio para imprimirlo o pegarlo en el mostrador.',
    keywords: [
      'agregar el qr',
      'agrego el qr',
      'descargar el qr',
      'generar el qr',
      'donde esta mi qr',
      'como consigo el qr',
    ],
  },
  {
    id: 'reviews-how-it-works',
    question: '¿Cómo funcionan las reseñas?',
    answer:
      'Flikker no manda solicitudes de reseña automáticas: primero conectás tu ficha desde Reseñas → "Buscar mi negocio en Google". Aparte, algunos clientes reciben una breve encuesta después del check-in y, según su respuesta, se les ofrece el link para dejarte una reseña en Google — vos ves las dos cosas (reseñas de Google y encuestas internas) por separado en Reseñas.',
    keywords: [
      'como funcionan las resenas',
      'como funciona las resenas',
      'resenas de google',
      'como recibo resenas',
      'como me llegan las resenas',
    ],
    cta: { label: 'Ir a Reseñas', href: '/dashboard/reviews' },
  },
  {
    id: 'we-miss-you',
    question: '¿Cómo funciona "Te extrañamos"?',
    answer:
      'Es una automatización de reactivación: Notificaciones → Automáticas. Ahí también está el horario en el que se permite mandar estos mensajes.',
    keywords: [
      'te extranamos',
      'como funciona te extranamos',
      'reactivacion automatica',
      'como funciona la reactivacion',
    ],
  },
  {
    id: 'message-schedule',
    question: '¿Cómo cambio el horario de mensajes?',
    answer:
      'Notificaciones → Automáticas — ahí está el horario permitido de envío.',
    keywords: [
      'horario de mensajes',
      'cambiar el horario',
      'cambio el horario de mensajes',
      'horario de envio',
      'a que hora se mandan los mensajes',
    ],
  },
  {
    id: 'view-customers',
    question: '¿Cómo veo mis clientes?',
    answer:
      'Clientes. Ahí está el listado completo, con quién volvió, quién está cerca de completar la tarjeta y quién tiene una recompensa esperando.',
    keywords: [
      'ver mis clientes',
      'veo mis clientes',
      'lista de clientes',
      'listado de clientes',
      'donde veo a mis clientes',
    ],
  },
  {
    id: 'upgrade-to-pro',
    question: '¿Cómo paso a Pro?',
    answer:
      'Configuración → Suscripción. Ahí ves tu plan actual y podés actualizar a Pro.',
    keywords: [
      'pasar a pro',
      'paso a pro',
      'actualizar a pro',
      'upgrade a pro',
      'como me paso a pro',
    ],
    cta: { label: 'Ir a Suscripción', href: '/dashboard/settings/suscripcion' },
  },
  {
    id: 'redeem-reward',
    question: '¿Cómo canjea un cliente un premio?',
    answer:
      'El cliente te muestra el QR de su beneficio o recompensa desde su teléfono. Vos lo abrís con la cámara nativa del teléfono (no hace falta ninguna app) — te lleva directo a la pantalla de canje, donde confirmás.',
    keywords: [
      'canjear un premio',
      'canjea un premio',
      'como canjea',
      'canjear una recompensa',
      'como se canjea el premio',
    ],
  },
  {
    id: 'authorize-benefit-reactivation',
    question: '¿Cómo autorizo un beneficio para reactivación?',
    answer:
      'Programa → Configuración → Beneficios → elegís el beneficio → activás "Autorizado para reactivar clientes". A partir de ahí, ese beneficio puede usarse en reactivaciones automáticas.',
    keywords: [
      'autorizar un beneficio',
      'beneficio para reactivacion',
      'autorizar beneficio para reactivar',
      'autorizar un beneficio para reactivacion',
    ],
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

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

/**
 * Prioridad 1 (determinística, nunca IA): si el texto crudo del usuario
 * contiene alguna de las `keywords` normalizadas de una entrada, se
 * responde con esa entrada directo — sin gastar cupo de IA ni depender de
 * que el proveedor esté configurado o disponible. Devuelve `null` cuando
 * nada matchea (ahí sigue el camino de clasificación por IA, que puede
 * cubrir paráfrasis que este matcher no contempla).
 */
export function matchHelpFaqEntryByText(rawText: string): HelpFaqEntry | null {
  const normalized = normalize(rawText);
  return (
    HELP_FAQ_ENTRIES.find((entry) =>
      entry.keywords.some((keyword) => normalized.includes(normalize(keyword))),
    ) ?? null
  );
}
