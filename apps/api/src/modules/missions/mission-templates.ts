import { MissionPeriodPreset } from '@prisma/client';

/**
 * Los cuatro puntos de partida que ve el dueño. NO son motores distintos:
 * cada uno precarga el mismo formulario y termina en la misma
 * `Mission`. Elegir un template no configura nada que no se pueda editar a
 * mano después.
 *
 * Viven en el backend, no en el componente, para que Programa y cualquier
 * futuro cliente ofrezcan exactamente las mismas opciones.
 */
export interface MissionTemplate {
  key: string;
  icon: string;
  /** El título del template en la grilla ("Aumentar frecuencia"). */
  label: string;
  /** Qué problema resuelve, en una línea. */
  hint: string;
  /** Valores precargados en el editor — todos editables. */
  defaults: {
    name: string;
    targetVisits: number;
    periodPreset: MissionPeriodPreset;
    periodDays: number | null;
  };
}

export const MISSION_TEMPLATES: MissionTemplate[] = [
  {
    key: 'frequency',
    icon: '🎯',
    label: 'Aumentar frecuencia',
    hint: 'Para clientes que ya vienen, pero podrían venir más seguido.',
    defaults: {
      name: 'Vení 3 veces este mes',
      targetVisits: 3,
      periodPreset: MissionPeriodPreset.THIS_MONTH,
      periodDays: null,
    },
  },
  {
    key: 'second_visit',
    icon: '🔁',
    label: 'Conseguir una segunda visita',
    hint: 'El salto más difícil: que quien vino una vez vuelva.',
    defaults: {
      name: 'Volvé una vez en los próximos 14 días',
      targetVisits: 1,
      periodPreset: MissionPeriodPreset.NEXT_N_DAYS,
      periodDays: 14,
    },
  },
  {
    key: 'quiet_days',
    icon: '🌙',
    label: 'Mover días tranquilos',
    hint: 'Un objetivo corto para empujar visitas en un período flojo.',
    defaults: {
      name: 'Vení 2 veces esta semana',
      targetVisits: 2,
      periodPreset: MissionPeriodPreset.THIS_WEEK,
      periodDays: null,
    },
  },
  {
    key: 'win_back',
    icon: '❤️',
    label: 'Recuperar clientes',
    hint: 'Una ventana con fecha límite clara para quien hace rato no viene.',
    defaults: {
      name: 'Volvé antes de que termine el mes',
      targetVisits: 1,
      periodPreset: MissionPeriodPreset.THIS_MONTH,
      periodDays: null,
    },
  },
];
