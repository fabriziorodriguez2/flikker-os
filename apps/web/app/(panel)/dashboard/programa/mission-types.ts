/** Contratos de Programa → Misiones. Espejo de `MissionAdminView` en la API. */

export type MissionStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "ENDED";

export type MissionPeriodPreset =
  | "THIS_WEEK"
  | "THIS_MONTH"
  | "NEXT_N_DAYS"
  | "CUSTOM";

export interface Mission {
  id: string;
  name: string;
  description: string | null;
  targetVisits: number;
  periodLabel: string;
  startsAt: string;
  endsAt: string;
  status: MissionStatus;
  rewardBenefitId: string | null;
  rewardName: string | null;
  rewardHiddenUntilComplete: boolean;
  participantCount: number;
  completedCount: number;
  /**
   * Falso apenas hay una participación. Las reglas (objetivo, fechas, premio)
   * se congelan ahí: cambiarlas le movería la meta a quien ya está jugando.
   */
  rulesEditable: boolean;
}

export interface MissionTemplate {
  key: string;
  icon: string;
  label: string;
  hint: string;
  defaults: {
    name: string;
    targetVisits: number;
    periodPreset: MissionPeriodPreset;
    periodDays: number | null;
  };
}

export interface CreateMissionPayload {
  name: string;
  description?: string;
  targetVisits: number;
  periodPreset: MissionPeriodPreset;
  periodDays?: number;
  rewardBenefitId?: string;
  rewardHiddenUntilComplete?: boolean;
}
