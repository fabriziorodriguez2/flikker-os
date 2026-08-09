import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import type { AuthenticatedRequest } from '../../common/types/request.types';
import { SimulationService } from './simulation.service';
import { CreateSimulationRunDto } from './dto/create-simulation-run.dto';

/**
 * Simulation Center (§0/§1/§25) — an internal Platform Admin tool, never a
 * business-facing feature. Every route here is platform-admin-only; there is
 * no tenant/business scoping to apply because this module never touches
 * real Business/Customer rows.
 */
@Controller('platform/simulations')
@UseGuards(JwtGuard, PlatformAdminGuard)
export class SimulationController {
  constructor(private readonly simulationService: SimulationService) {}

  /** §25/§42 — lets the panel show "not configured" without a real run. */
  @Get('status')
  getStatus() {
    return this.simulationService.getStatus();
  }

  /** §25 — list of past/current simulation runs (bookkeeping only). */
  @Get()
  list() {
    return this.simulationService.listRuns();
  }

  /** §25/§27 — status/progress/results (once available) for one run. */
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.simulationService.getRun(id);
  }

  /** §25/§26 — creates the PENDING row and enqueues it; never blocks on the run itself. */
  @Post()
  create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateSimulationRunDto,
  ) {
    return this.simulationService.createRun(req.user.id, dto);
  }

  /** §28 — cooperative cancel; the worker checks this between virtual days. */
  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.simulationService.cancelRun(id);
  }
}
