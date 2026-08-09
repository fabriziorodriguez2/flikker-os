import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SimulationController } from './simulation.controller';
import { SimulationService } from './simulation.service';
import { SimulationRepository } from './simulation.repository';
import { SimulationConfigService } from './simulation-config.service';
import { SimulationQueue } from './simulation.queue';
import { SimulationWorker } from './simulation.worker';
import { SimulationRunnerService } from './simulation-runner.service';

/**
 * The main-app-facing half of the Simulation Center (§1/§25/§26) — HTTP
 * endpoints, the bookkeeping repository (against the MAIN database), and
 * the queue/worker/runner that drive an actual run. `SimulationRootModule`
 * (a separate file) is the OTHER half: the isolated Nest context booted
 * per run, reached only via `bootIsolatedSimulationContext` — it is never
 * imported here, and this module never touches the simulation database
 * directly.
 */
@Module({
  imports: [JwtModule.register({})],
  controllers: [SimulationController],
  providers: [
    SimulationService,
    SimulationRepository,
    SimulationConfigService,
    SimulationQueue,
    SimulationWorker,
    SimulationRunnerService,
  ],
  exports: [SimulationConfigService],
})
export class SimulationModule {}
