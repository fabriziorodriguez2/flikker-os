import { SimulationWorker } from './simulation.worker';
import { RUN_SIMULATION_JOB } from './simulation.queue';

function makeJob(name: string, data: unknown) {
  return { name, data } as never;
}

describe('SimulationWorker — dispatches to the runner, exactly like every other worker', () => {
  it("calls SimulationRunnerService.run with the job's simulationRunId for the real job name", async () => {
    const runner = { run: jest.fn().mockResolvedValue(undefined) };
    const worker = new SimulationWorker(runner as never);

    await worker.process(
      makeJob(RUN_SIMULATION_JOB, { simulationRunId: 'run-1' }),
    );

    expect(runner.run).toHaveBeenCalledWith('run-1');
  });

  it('ignores an unknown job name without calling the runner', async () => {
    const runner = { run: jest.fn() };
    const worker = new SimulationWorker(runner as never);

    await worker.process(
      makeJob('some-other-job', { simulationRunId: 'run-1' }),
    );

    expect(runner.run).not.toHaveBeenCalled();
  });
});
