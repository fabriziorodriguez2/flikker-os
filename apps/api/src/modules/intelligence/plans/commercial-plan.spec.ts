import {
  estimatePlanCost,
  planFingerprint,
  validateCommercialPlan,
  type AuthorizedIncentive,
  type CommercialPlan,
  type PlanValidationContext,
} from './commercial-plan';

const coffee: AuthorizedIncentive = {
  id: 'inc-coffee',
  label: 'Café de regalo',
  unitCost: 60,
  percentageValue: null,
  fixedValue: null,
  expiresInDays: 7,
  allowFreeWording: true,
};
const tenOff: AuthorizedIncentive = {
  id: 'inc-10',
  label: '10% OFF',
  unitCost: 45,
  percentageValue: 10,
  fixedValue: null,
  expiresInDays: 14,
  allowFreeWording: false,
};
const noCost: AuthorizedIncentive = {
  id: 'inc-nocost',
  label: '15% OFF',
  unitCost: null,
  percentageValue: 15,
  fixedValue: null,
  expiresInDays: 7,
  allowFreeWording: false,
};

const ctx: PlanValidationContext = {
  incentives: new Map([coffee, tenOff, noCost].map((i) => [i.id, i])),
  facts: {
    'customers.overdue_regulars': 18,
    'visits.last_28d_vs_prev_change_pct': -32.5,
  },
  now: new Date('2026-11-14T15:00:00Z'),
  today: '2026-11-14',
};

function plan(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    title: 'Habituales que se están demorando',
    objective: 'RECOVER_DECLINING',
    hypothesis:
      'Clientes que venían cada dos semanas dejaron de venir; un recordatorio sin descuento puede alcanzar.',
    evidence: [
      {
        metric: 'customers.overdue_regulars',
        value: 18,
        statement: '18 habituales pasaron 1,5 veces su frecuencia sin volver.',
      },
    ],
    segment: {
      description: 'Habituales demorados',
      rule: {
        all: [
          { field: 'visitCount', op: 'gte', value: 3 },
          { field: 'overdueRatio', op: 'gt', value: 1.5 },
        ],
      },
      maxRecipients: 20,
    },
    channel: 'WHATSAPP',
    variants: [
      {
        key: 'A',
        message:
          'Hola {nombre}, hace un tiempo que no te vemos. ¡Te esperamos!',
        incentiveId: null,
        weightPercent: 40,
      },
      {
        key: 'B',
        message:
          'Hola {nombre}, tu próximo café va de regalo, gratis, por 7 días.',
        incentiveId: 'inc-coffee',
        weightPercent: 40,
      },
    ],
    controlPercent: 20,
    schedule: { startOn: 'ASAP', sendWithinDays: 3 },
    successMetric: { kind: 'RETURN_VISIT', windowDays: 21 },
    stopConditions: { maxOptOutPercent: 5, maxFailurePercent: 20 },
    rationale:
      'Es el grupo más grande con señal clara y no requiere descuento para probar.',
    ...over,
  };
}

const codes = (input: unknown) => {
  const result = validateCommercialPlan(input, ctx);
  return result.valid ? [] : result.issues.map((i) => i.code);
};

describe('validateCommercialPlan', () => {
  it('acepta un plan bien formado y devuelve su huella', () => {
    const result = validateCommercialPlan(plan(), ctx);
    expect(result).toMatchObject({ valid: true });
    expect(result.valid && result.fingerprint).toHaveLength(64);
  });

  it('devuelve todos los problemas juntos, no solo el primero', () => {
    expect(
      codes(plan({ title: '', controlPercent: 0, channel: 'SMS' })).length,
    ).toBeGreaterThanOrEqual(3);
  });

  describe('evidencia: cada número sale de los datos', () => {
    it('rechaza una métrica que no existe', () => {
      expect(
        codes(
          plan({
            evidence: [
              { metric: 'customers.vip', value: 3, statement: 'Hay 3 VIP.' },
            ],
          }),
        ),
      ).toContain('UNKNOWN_METRIC');
    });

    it('rechaza un valor inventado o redondeado de más', () => {
      expect(
        codes(
          plan({
            evidence: [
              {
                metric: 'customers.overdue_regulars',
                value: 25,
                statement: '25',
              },
            ],
          }),
        ),
      ).toContain('EVIDENCE_MISMATCH');
    });

    it('tolera el redondeo a dos decimales', () => {
      expect(
        codes(
          plan({
            evidence: [
              {
                metric: 'visits.last_28d_vs_prev_change_pct',
                value: -32.5,
                statement: 'Bajaron 32,5% las visitas.',
              },
            ],
          }),
        ),
      ).toEqual([]);
    });

    it('exige al menos una evidencia', () => {
      expect(codes(plan({ evidence: [] }))).toContain('EVIDENCE_COUNT');
    });
  });

  describe('incentivos y mensajes: nada que el dueño no haya autorizado', () => {
    it('rechaza un incentivo fuera del catálogo autorizado', () => {
      expect(
        codes(
          plan({
            variants: [
              {
                key: 'A',
                message: 'Hola',
                incentiveId: 'inc-made-up',
                weightPercent: 80,
              },
            ],
          }),
        ),
      ).toContain('INCENTIVE_NOT_AUTHORIZED');
    });

    it('rechaza un incentivo sin costo estimable', () => {
      expect(
        codes(
          plan({
            variants: [
              {
                key: 'A',
                message: 'Hola {nombre}',
                incentiveId: 'inc-nocost',
                weightPercent: 80,
              },
            ],
          }),
        ),
      ).toContain('INCENTIVE_COST_UNKNOWN');
    });

    it('rechaza un descuento inventado en el texto', () => {
      expect(
        codes(
          plan({
            variants: [
              {
                key: 'A',
                message: 'Hola {nombre}, volvé y tenés 20% de descuento.',
                incentiveId: null,
                weightPercent: 80,
              },
            ],
          }),
        ),
      ).toContain('COPY_UNAUTHORIZED_PERCENTAGE');
    });

    it('rechaza un porcentaje distinto al del incentivo elegido', () => {
      expect(
        codes(
          plan({
            variants: [
              {
                key: 'A',
                message: 'Hola {nombre}, tenés 15% OFF en tu próxima visita.',
                incentiveId: 'inc-10',
                weightPercent: 80,
              },
            ],
          }),
        ),
      ).toContain('COPY_UNAUTHORIZED_PERCENTAGE');
    });

    it('acepta el porcentaje exacto del incentivo', () => {
      expect(
        codes(
          plan({
            variants: [
              {
                key: 'A',
                message: 'Hola {nombre}, tenés 10% OFF en tu próxima visita.',
                incentiveId: 'inc-10',
                weightPercent: 80,
              },
            ],
          }),
        ),
      ).toEqual([]);
    });

    it('rechaza "gratis" sin un regalo detrás, y montos sin incentivo', () => {
      expect(
        codes(
          plan({
            variants: [
              {
                key: 'A',
                message: 'Tu café gratis te espera',
                incentiveId: null,
                weightPercent: 40,
              },
              {
                key: 'B',
                message: 'Te regalamos $500',
                incentiveId: null,
                weightPercent: 40,
              },
            ],
          }),
        ),
      ).toEqual(
        expect.arrayContaining([
          'COPY_UNAUTHORIZED_FREE_CLAIM',
          'COPY_UNAUTHORIZED_AMOUNT',
        ]),
      );
    });

    it('rechaza links, marcadores desconocidos y lenguaje interno', () => {
      expect(
        codes(
          plan({
            variants: [
              {
                key: 'A',
                message: 'Mirá https://x.com',
                incentiveId: null,
                weightPercent: 30,
              },
              {
                key: 'B',
                message: 'Hola {apellido}',
                incentiveId: null,
                weightPercent: 25,
              },
              {
                key: 'C',
                message: 'Estás en riesgo de abandono',
                incentiveId: null,
                weightPercent: 25,
              },
            ],
          }),
        ),
      ).toEqual(
        expect.arrayContaining([
          'COPY_CONTAINS_URL',
          'PLACEHOLDER',
          'COPY_INTERNAL_SEGMENT_LANGUAGE',
        ]),
      );
    });
  });

  describe('medición y control', () => {
    it('exige grupo de control', () => {
      expect(codes(plan({ controlPercent: 0 }))).toContain('CONTROL_REQUIRED');
      expect(codes(plan({ controlPercent: 5 }))).toContain('CONTROL_REQUIRED');
    });

    it('exige que variantes y control sumen 100', () => {
      expect(codes(plan({ controlPercent: 30 }))).toContain('WEIGHTS');
    });

    it('exige claves de variante únicas', () => {
      expect(
        codes(
          plan({
            variants: [
              {
                key: 'A',
                message: 'Hola',
                incentiveId: null,
                weightPercent: 40,
              },
              {
                key: 'A',
                message: 'Hola de nuevo',
                incentiveId: null,
                weightPercent: 40,
              },
            ],
          }),
        ),
      ).toContain('VARIANT_KEY');
    });

    it('exige métrica de éxito y condiciones de corte dentro de rango', () => {
      expect(
        codes(
          plan({
            successMetric: { kind: 'LIKES', windowDays: 21 },
            stopConditions: { maxOptOutPercent: 50, maxFailurePercent: 20 },
          }),
        ),
      ).toEqual(expect.arrayContaining(['SUCCESS_METRIC', 'STOP_CONDITIONS']));
    });
  });

  it('solo acepta canales que Flikker tiene', () => {
    expect(codes(plan({ channel: 'EMAIL' }))).toContain('CHANNEL_UNAVAILABLE');
  });

  it('acota la fecha de inicio', () => {
    expect(
      codes(plan({ schedule: { startOn: '2026-11-20', sendWithinDays: 2 } })),
    ).toEqual([]);
    expect(
      codes(plan({ schedule: { startOn: '2026-11-13', sendWithinDays: 2 } })),
    ).toContain('SCHEDULE');
    expect(
      codes(plan({ schedule: { startOn: '2027-01-30', sendWithinDays: 2 } })),
    ).toContain('SCHEDULE');
  });

  it('rechaza un segmento con rasgos que no existen', () => {
    expect(
      codes(
        plan({
          segment: {
            description: 'x',
            rule: { field: 'email', op: 'not_null' },
            maxRecipients: 10,
          },
        }),
      ),
    ).toContain('SEGMENT_RULE');
  });
});

describe('planFingerprint', () => {
  it('es la misma aunque cambie la redacción o el orden de la regla', () => {
    const a = plan() as unknown as CommercialPlan;
    const b = plan({
      title: 'Otro título',
      segment: {
        description: 'Otra descripción',
        rule: {
          all: [
            { field: 'overdueRatio', op: 'gt', value: 1.5 },
            { field: 'visitCount', op: 'gte', value: 3 },
          ],
        },
        maxRecipients: 5,
      },
    }) as unknown as CommercialPlan;
    expect(planFingerprint(a)).toBe(planFingerprint(b));
  });

  it('cambia si cambia el incentivo', () => {
    const a = plan() as unknown as CommercialPlan;
    const b = plan({
      variants: [
        { key: 'A', message: 'Hola', incentiveId: 'inc-10', weightPercent: 80 },
      ],
    }) as unknown as CommercialPlan;
    expect(planFingerprint(a)).not.toBe(planFingerprint(b));
  });
});

describe('estimatePlanCost', () => {
  it('separa control, mensajería e incentivos (peor caso)', () => {
    const p = plan() as unknown as CommercialPlan;
    // 20 destinatarios: 4 control, 16 tratados; la mitad recibe el café (60).
    expect(estimatePlanCost(p, 20, ctx.incentives, 2.5)).toEqual({
      recipients: 20,
      treated: 16,
      control: 4,
      messaging: 40,
      incentivesMaxLiability: 480,
      total: 520,
    });
  });
});
