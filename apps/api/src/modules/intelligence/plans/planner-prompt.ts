import type { AgentToolDefinition } from '../../ai/ai-agent-provider.interface';
import {
  MESSAGE_PLACEHOLDERS,
  PLAN_LIMITS,
  PLAN_OBJECTIVES,
  SUCCESS_METRICS,
  type AuthorizedIncentive,
} from './commercial-plan';
import { FACT_DESCRIPTIONS, type BusinessSnapshot } from './business-snapshot';
import { FIELD_DESCRIPTIONS } from './segment-rules';
import {
  MAX_SELECTED_PLANS,
  MIN_PLAN_RECIPIENTS,
  SMALL_SAMPLE_RECIPIENTS,
  type PlannerBudget,
} from './planner-evaluation';

/**
 * Instrucciones y herramientas del planificador comercial. El modelo piensa
 * con libertad (qué mirar, qué hipótesis, qué segmentos, qué mensajes, cuál
 * elegir); el servidor valida todo lo que propone antes de que exista.
 */

export const PLANNER_INSTRUCTIONS = `Sos el estratega comercial de Flikker para UN comercio físico (cafetería, peluquería, local). Tu trabajo: mirar los datos reales del negocio, descubrir oportunidades de retención y crecimiento, y diseñar campañas propias para aprovecharlas.

Ciclo de trabajo:
1. Observar: leé las métricas y el historial de planes.
2. Analizar y formular hipótesis comerciales concretas, citando métricas.
3. Diseñar estrategias: armá segmentos con la regla que haga falta (no hay una lista cerrada de campañas), mensajes originales en el tono del negocio e incentivos SOLO del catálogo autorizado (o ninguno).
4. Evaluar: usá preview_segment para ver cuántos clientes entran, cuántos se pueden contactar y cuántos están disponibles hoy ("availableNow": sin los que recibieron una promoción hace poco). Compará alternativas.
5. Decidir: elegí hasta ${MAX_SELECTED_PLANS} planes (los más prometedores, con clientes distintos), o decidí NO actuar o esperar más información si los datos no lo justifican.
6. Entregá todo con submit_plans. Es la única forma de terminar.

Tu objetivo es que más clientes vuelvan, no mandar más mensajes. Los límites de "limits" son MÁXIMOS disponibles, nunca metas: no hace falta usar todo el presupuesto, ni las promociones por cliente, ni las campañas de la semana. Decidí vos cuántos clientes contactar, qué segmentos priorizar, si conviene una promoción, si conviene un incentivo o no, cuántos planes ejecutar y cuándo frenar o esperar. Gastar menos con el mismo resultado es mejor.

Tamaño de los grupos:
- "customerBase.weeklyLimitMode" = "ADAPTIVE" (menos de 150 clientes registrados): no hay tope semanal por porcentaje. Elegí el tamaño de cada grupo según cuántos clientes son realmente elegibles, su frecuencia de visita, el historial de campañas, la probabilidad de que vuelvan, el presupuesto que queda, el costo de los incentivos, el riesgo de saturar a los mismos clientes y la calidad de los datos. Puede ser un grupo chico o amplio: justificalo en "rationale". Una base chica no es motivo para no actuar.
- "PERCENT": además, el total de clientes nuevos de la semana no puede pasar "newRecipientsLeftThisWeek".
- Con pocos clientes elegibles (menos de ${SMALL_SAMPLE_RECIPIENTS}) igual podés proponer una acción chica si tiene sentido comercial: es un gesto, no un experimento. No le atribuyas resultados estadísticos ni la presentes como prueba.

Reglas que el servidor verifica (si no se cumplen, el plan se descarta):
- Cada número que escribas (hipótesis, evidencia, resumen) tiene que salir de las métricas, de una vista previa o de los datos del catálogo. No redondees ni estimes cifras nuevas.
- La evidencia cita métricas por su clave exacta con su valor exacto.
- Los mensajes no pueden prometer descuentos, montos, plazos, regalos ni sorteos que el incentivo elegido no tenga. Sin incentivo, el mensaje no ofrece nada material. Sin links ni teléfonos. Solo el marcador ${MESSAGE_PLACEHOLDERS.join(', ')}. Nunca lenguaje interno ("en riesgo", "te estamos siguiendo").
- Siempre grupo de control (${PLAN_LIMITS.controlPercentMin}–${PLAN_LIMITS.controlPercentMax}%): pesos de variantes + control = 100. Hasta ${PLAN_LIMITS.variantsMax} variantes para comparar enfoques.
- Equilibrio de costo: si un plan ofrece un incentivo, incluí también una variante SIN incentivo, salvo que el historial ya muestre que sin incentivo no funcionó. Así se aprende si el incentivo hace falta. Preferí lo más barato que pueda funcionar.
- Incentivos: el presupuesto lo define el dueño. Si "limits.incentiveBudgetSet" es false, el catálogo viene vacío: diseñá sin premios (recordatorios, novedades, invitaciones) y, si un incentivo haría falta, decilo en "nextSteps" para que el dueño decida. Si queda 0 de incentivos, tampoco uses premios con costo.
- Costo: la política reserva el peor caso para TODOS los clientes del plan (control incluido): mensajes = messageCost × clientes; incentivos = el incentivo más caro del plan × clientes. Eso tiene que entrar en lo que queda de cada presupuesto del mes y en el tope por campaña de cada bolsa ("maxMessagingPerCampaign", "maxIncentivesPerCampaign"). Si no entra, el servidor achica el grupo o lo descarta: diseñá dentro de esos números (menos clientes, incentivo más barato o sin incentivo).
- Campañas: no elijas más planes que "newCampaignsLeftThisWeek".
- Frecuencia: cada cliente recibe como máximo "maxMessagesPer30DaysPerCustomer" promociones cada 30 días, separadas por "minDaysBetweenMessagesToSameCustomer" días, contando todo lo que le mandó Flikker. Quien recibió algo hace poco descansa ("customerBase.resting"); no lo cuentes. Que el máximo sea 3 no significa mandar 3: contactá menos si te parece excesivo.
- Un plan elegido necesita al menos ${MIN_PLAN_RECIPIENTS} cliente disponible. Solo se contacta a quien autorizó WhatsApp.
- Canal disponible: solo WHATSAPP. No inventes otros canales.
- No repitas un plan que ya se probó y se está midiendo: probá algo distinto o esperá el resultado.
- Aprendé del historial: plan_history trae el resultado medido de cada plan ejecutado (cuántos contactados volvieron, frente al control, y su lectura de evidencia). Mencioná en "observations" lo que mostró el último resultado y usalo para decidir: si un enfoque dio señal, confirmalo con más clientes o en un grupo parecido; si no funcionó, cambiá de enfoque. Una señal con pocos clientes no es una prueba.
- "contactability" dice cuántos clientes se pueden contactar y por qué el resto no. Si son pocos, decilo en el resumen: ampliar la base contactable (pidiendo autorización en el check-in) puede valer más que cualquier campaña.
- Con pocos clientes no hay significancia estadística: decilo y proponé pruebas chicas y prudentes. No afirmes causalidad.

La regla del segmento va como JSON en texto. Forma: una condición {"field": rasgo, "op": operador, "value": valor} o combinaciones {"all": [...]}, {"any": [...]}, {"not": {...}}. Operadores numéricos: eq, neq, gt, gte, lt, lte, between ([min, max]), is_null, not_null. Para "segment": eq, neq, in (lista).

ownerSummary: 2 a 5 oraciones para el dueño, en castellano rioplatense simple, sin jerga técnica: qué viste, qué harías y por qué (o por qué no hacés nada). Esto es una SIMULACIÓN: no digas que enviaste ni que vas a enviar nada todavía.`;

export interface PlannerPolicyInfo {
  accepted: boolean;
  minDaysBetweenPromotions: number;
  maxPromotionsPer30Days: number;
  sendingHours: string;
}

export function buildPlannerContext(input: {
  businessName: string;
  timezone: string;
  currency: string;
  today: string;
  snapshot: BusinessSnapshot;
  incentives: AuthorizedIncentive[];
  budget: PlannerBudget;
  policy: PlannerPolicyInfo;
  /** Cuántos se pueden contactar y por qué el resto no. */
  contactability?: object;
  /** Tamaño de la base y cuántos están disponibles hoy. */
  base?: {
    registered: number;
    contactable: number;
    availableNow: number;
    resting: number;
  };
}): string {
  const facts = Object.fromEntries(
    Object.entries(input.snapshot.facts).map(([key, value]) => [
      key,
      { value, meaning: FACT_DESCRIPTIONS[key] ?? '' },
    ]),
  );
  return JSON.stringify(
    {
      business: {
        name: input.businessName,
        timezone: input.timezone,
        currency: input.currency,
        today: input.today,
      },
      metrics: facts,
      segmentFeatures: FIELD_DESCRIPTIONS,
      incentiveCatalog: input.incentives.map((i) => ({
        id: i.id,
        label: i.label,
        estimatedCostPerIssue: i.unitCost,
        percentage: i.percentageValue,
        fixedAmount: i.fixedValue,
        validDays: i.expiresInDays,
        usable: i.unitCost !== null,
      })),
      customerBase: input.base
        ? {
            ...input.base,
            weeklyLimitMode: input.budget.weeklyLimitMode ?? 'PERCENT',
          }
        : null,
      limits: {
        note: 'Máximos disponibles, no metas.',
        policyAccepted: input.policy.accepted,
        messageCost: input.budget.messageUnitCost,
        messagingBudgetLeftThisMonth: input.budget.messagingRemaining,
        incentiveBudgetSet: input.budget.incentiveBudgetSet ?? true,
        incentiveBudgetLeftThisMonth:
          input.budget.incentiveBudgetSet === false
            ? null
            : input.budget.incentiveRemaining,
        newRecipientsLeftThisWeek: input.budget.weeklyRecipientsRemaining,
        newCampaignsLeftThisWeek: input.budget.newCampaignsRemaining ?? null,
        maxMessagingPerCampaign: input.budget.maxMessagingPerCampaign ?? null,
        maxIncentivesPerCampaign: input.budget.maxIncentivesPerCampaign ?? null,
        minDaysBetweenMessagesToSameCustomer:
          input.policy.minDaysBetweenPromotions,
        maxMessagesPer30DaysPerCustomer: input.policy.maxPromotionsPer30Days,
        sendingHours: input.policy.sendingHours,
      },
      contactability: input.contactability ?? null,
    },
    null,
    1,
  );
}

const nullable = (type: string) => ({ type: [type, 'null'] });

const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'schemaVersion',
    'title',
    'objective',
    'hypothesis',
    'evidence',
    'segment',
    'channel',
    'variants',
    'controlPercent',
    'schedule',
    'successMetric',
    'stopConditions',
    'rationale',
    'selected',
    'rank',
    'selectionReason',
  ],
  properties: {
    schemaVersion: { type: 'integer', enum: [1] },
    title: { type: 'string' },
    objective: { type: 'string', enum: [...PLAN_OBJECTIVES] },
    hypothesis: { type: 'string' },
    evidence: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['metric', 'value', 'statement'],
        properties: {
          metric: { type: 'string', description: 'Clave exacta de metrics.' },
          value: { type: 'number' },
          statement: { type: 'string' },
        },
      },
    },
    segment: {
      type: 'object',
      additionalProperties: false,
      required: ['description', 'rule', 'maxRecipients'],
      properties: {
        description: { type: 'string' },
        rule: { type: 'string', description: 'Regla del segmento en JSON.' },
        maxRecipients: { type: 'integer' },
      },
    },
    channel: { type: 'string', enum: ['WHATSAPP'] },
    variants: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'message', 'incentiveId', 'weightPercent'],
        properties: {
          key: { type: 'string', description: 'Una letra: A, B, C.' },
          message: { type: 'string' },
          incentiveId: {
            ...nullable('string'),
            description: 'Id del catálogo o null.',
          },
          weightPercent: { type: 'integer' },
        },
      },
    },
    controlPercent: { type: 'integer' },
    schedule: {
      type: 'object',
      additionalProperties: false,
      required: ['startOn', 'sendWithinDays'],
      properties: {
        startOn: { type: 'string', description: "'ASAP' o AAAA-MM-DD." },
        sendWithinDays: { type: 'integer' },
      },
    },
    successMetric: {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'windowDays'],
      properties: {
        kind: { type: 'string', enum: [...SUCCESS_METRICS] },
        windowDays: { type: 'integer' },
      },
    },
    stopConditions: {
      type: 'object',
      additionalProperties: false,
      required: ['maxOptOutPercent', 'maxFailurePercent'],
      properties: {
        maxOptOutPercent: { type: 'integer' },
        maxFailurePercent: { type: 'integer' },
      },
    },
    rationale: { type: 'string' },
    selected: { type: 'boolean' },
    rank: {
      ...nullable('integer'),
      description: '1 = el primero; null si no se elige.',
    },
    selectionReason: nullable('string'),
  },
};

export const PLANNER_TOOLS: AgentToolDefinition[] = [
  {
    name: 'preview_segment',
    description:
      'Cuántos clientes entran en una regla de segmento ("matched"), cuántos se pueden contactar con WhatsApp autorizado ("reachable") y cuántos de esos están disponibles hoy según la frecuencia máxima ("availableNow"). Valida la regla. No devuelve datos de clientes.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['rule'],
      properties: {
        rule: { type: 'string', description: 'Regla del segmento en JSON.' },
      },
    },
  },
  {
    name: 'plan_history',
    description:
      'Planes que propusiste antes para este negocio (últimos 60 días): objetivo, segmento, estado y resultado si existe. Usalo para no repetir y aprender.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: [],
      properties: {},
    },
  },
  {
    name: 'submit_plans',
    description:
      'Entrega final: observaciones, hipótesis, decisión, planes (elegidos y descartados) y el resumen para el dueño. El servidor lo valida y te devuelve problemas si los hay.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: [
        'observations',
        'hypotheses',
        'decision',
        'noActionReason',
        'ownerSummary',
        'nextSteps',
        'plans',
      ],
      properties: {
        observations: { type: 'array', items: { type: 'string' } },
        hypotheses: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['statement', 'metrics'],
            properties: {
              statement: { type: 'string' },
              metrics: { type: 'array', items: { type: 'string' } },
            },
          },
        },
        decision: { type: 'string', enum: ['PROPOSE', 'NO_ACTION'] },
        noActionReason: nullable('string'),
        ownerSummary: { type: 'string' },
        nextSteps: { type: 'array', items: { type: 'string' } },
        plans: { type: 'array', items: PLAN_SCHEMA },
      },
    },
  },
];
