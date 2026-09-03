import { RUN_REWARD_GOAL_SWEEP_JOB } from '../reward-goal.queue';
import { RewardGoalWorker } from './reward-goal.worker';

function buildHarness() {
  const sweep = {
    runDaily: jest.fn().mockResolvedValue({ evaluated: 0 }),
    expireOverdue: jest.fn().mockResolvedValue({ checked: 0, expired: 0 }),
  };
  const missions = {
    reconcilePendingRewards: jest
      .fn()
      .mockResolvedValue({ pending: 0, issued: 0, failed: 0 }),
    expireOverdue: jest
      .fn()
      .mockResolvedValue({ missionsEnded: 0, participationsExpired: 0 }),
  };
  const returnChallenges = {
    expireOverdue: jest.fn().mockResolvedValue({ expired: 0 }),
  };
  const worker = new RewardGoalWorker(
    sweep as never,
    missions as never,
    returnChallenges as never,
  );
  const run = () =>
    worker.process({ name: RUN_REWARD_GOAL_SWEEP_JOB } as never);
  return { worker, sweep, missions, returnChallenges, run };
}

describe('RewardGoalWorker — el tick diario dispara los cuatro barridos', () => {
  it('corre los de reward goals Y los de misiones', async () => {
    const h = buildHarness();

    const result = await h.run();

    expect(h.sweep.runDaily).toHaveBeenCalled();
    expect(h.sweep.expireOverdue).toHaveBeenCalled();
    expect(h.missions.reconcilePendingRewards).toHaveBeenCalled();
    expect(h.missions.expireOverdue).toHaveBeenCalled();
    expect(result).toMatchObject({
      missionRewards: { pending: 0, issued: 0, failed: 0 },
      missionExpiry: { missionsEnded: 0, participationsExpired: 0 },
    });
  });

  it('un barrido que falla no saltea a los otros tres', async () => {
    // Es la razón por la que estos cuatro comparten un tick sin necesitar
    // colas separadas: `allSettled` los aísla entre sí.
    const h = buildHarness();
    h.missions.reconcilePendingRewards.mockRejectedValue(new Error('boom'));

    const result = await h.run();

    expect(h.sweep.runDaily).toHaveBeenCalled();
    expect(h.sweep.expireOverdue).toHaveBeenCalled();
    expect(h.missions.expireOverdue).toHaveBeenCalled();
    expect(result).toMatchObject({ missionRewards: null });
  });

  it('los cuatro comparten el MISMO instante', async () => {
    // Dos "ahora" distintos dentro del mismo tick podrían caer en lados
    // opuestos de un vencimiento.
    const h = buildHarness();

    await h.run();

    const now = h.sweep.expireOverdue.mock.calls[0][0] as Date;
    expect(h.missions.expireOverdue).toHaveBeenCalledWith(now);
    expect(h.sweep.runDaily).toHaveBeenCalledWith(now, false);
  });

  it('ignora un job desconocido', async () => {
    const h = buildHarness();

    const result = await h.worker.process({ name: 'otra-cosa' } as never);

    expect(result).toBeNull();
    expect(h.missions.expireOverdue).not.toHaveBeenCalled();
  });
});
