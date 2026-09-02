import { MissionStatus } from '@prisma/client';
import {
  canTransition,
  computeMissionProgress,
  isMissionLive,
  MISSION_LOCKED_FIELDS,
  visibleRewardName,
} from './mission-rules';

describe('computeMissionProgress', () => {
  it('sin visitas es 0 de N — nunca un progreso inventado', () => {
    expect(computeMissionProgress(0, 3)).toEqual({
      current: 0,
      target: 3,
      remaining: 3,
      complete: false,
    });
  });

  it('la primera visita suma 1 de N', () => {
    expect(computeMissionProgress(1, 3)).toMatchObject({
      current: 1,
      remaining: 2,
      complete: false,
    });
  });

  it('completa al alcanzar el objetivo', () => {
    expect(computeMissionProgress(3, 3)).toMatchObject({
      current: 3,
      remaining: 0,
      complete: true,
    });
  });

  it('nunca muestra más del objetivo, aunque haya visitas de sobra', () => {
    // Alguien puede seguir viniendo después de completar: la tarjeta no debe
    // decir "7 de 3".
    expect(computeMissionProgress(7, 3)).toMatchObject({
      current: 3,
      remaining: 0,
      complete: true,
    });
  });
});

describe('visibleRewardName — el premio secreto es solo presentación', () => {
  const conPremio = {
    rewardHiddenUntilComplete: true,
    rewardBenefit: { title: '1 café gratis' },
  };

  it('lo oculta antes de completar', () => {
    expect(visibleRewardName(conPremio, false)).toBeNull();
  });

  it('lo revela al completar', () => {
    expect(visibleRewardName(conPremio, true)).toBe('1 café gratis');
  });

  it('un premio no secreto se ve desde el principio', () => {
    const visible = { ...conPremio, rewardHiddenUntilComplete: false };
    expect(visibleRewardName(visible, false)).toBe('1 café gratis');
  });

  it('una misión sin premio no muestra nada, ni siquiera completada', () => {
    const sinPremio = { rewardHiddenUntilComplete: true, rewardBenefit: null };
    expect(visibleRewardName(sinPremio, true)).toBeNull();
  });
});

describe('isMissionLive', () => {
  const ventana = {
    startsAt: new Date('2026-09-01T03:00:00Z'),
    endsAt: new Date('2026-10-01T03:00:00Z'),
  };
  const dentro = new Date('2026-09-15T12:00:00Z');

  it('una misión ACTIVE dentro de su ventana cuenta', () => {
    expect(
      isMissionLive({ ...ventana, status: MissionStatus.ACTIVE }, dentro),
    ).toBe(true);
  });

  it('una misión PAUSED no cuenta, aunque la ventana esté abierta', () => {
    expect(
      isMissionLive({ ...ventana, status: MissionStatus.PAUSED }, dentro),
    ).toBe(false);
  });

  it('una misión DRAFT no cuenta', () => {
    expect(
      isMissionLive({ ...ventana, status: MissionStatus.DRAFT }, dentro),
    ).toBe(false);
  });

  it('no cuenta antes de empezar ni después de terminar', () => {
    const activa = { ...ventana, status: MissionStatus.ACTIVE };
    expect(isMissionLive(activa, new Date('2026-08-31T12:00:00Z'))).toBe(false);
    expect(isMissionLive(activa, new Date('2026-10-02T12:00:00Z'))).toBe(false);
  });

  it('el instante exacto del fin ya está AFUERA (ventana medio-abierta)', () => {
    const activa = { ...ventana, status: MissionStatus.ACTIVE };
    expect(isMissionLive(activa, ventana.endsAt)).toBe(false);
    expect(isMissionLive(activa, ventana.startsAt)).toBe(true);
  });
});

describe('canTransition', () => {
  it('ENDED es terminal: no se puede reabrir una misión archivada', () => {
    for (const to of [
      MissionStatus.DRAFT,
      MissionStatus.ACTIVE,
      MissionStatus.PAUSED,
    ]) {
      expect(canTransition(MissionStatus.ENDED, to)).toBe(false);
    }
  });

  it('se puede pausar y reanudar', () => {
    expect(canTransition(MissionStatus.ACTIVE, MissionStatus.PAUSED)).toBe(
      true,
    );
    expect(canTransition(MissionStatus.PAUSED, MissionStatus.ACTIVE)).toBe(
      true,
    );
  });

  it('cualquier estado no terminal puede terminarse', () => {
    for (const from of [
      MissionStatus.DRAFT,
      MissionStatus.ACTIVE,
      MissionStatus.PAUSED,
    ]) {
      expect(canTransition(from, MissionStatus.ENDED)).toBe(true);
    }
  });

  it('una misión ACTIVE no vuelve a DRAFT', () => {
    expect(canTransition(MissionStatus.ACTIVE, MissionStatus.DRAFT)).toBe(
      false,
    );
  });
});

describe('MISSION_LOCKED_FIELDS', () => {
  it('congela exactamente las reglas del juego y la promesa', () => {
    expect([...MISSION_LOCKED_FIELDS].sort()).toEqual([
      'endsAt',
      'periodDays',
      'periodPreset',
      'rewardBenefitId',
      'startsAt',
      'targetVisits',
    ]);
  });

  it('no congela nombre ni descripción — eso es copy, no regla', () => {
    const locked: readonly string[] = MISSION_LOCKED_FIELDS;
    expect(locked).not.toContain('name');
    expect(locked).not.toContain('description');
    expect(locked).not.toContain('status');
  });
});
