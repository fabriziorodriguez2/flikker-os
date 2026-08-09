import { Injectable } from '@nestjs/common';
import { Prisma, SimulationScenario, SimulationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const LIST_SELECT = {
  id: true,
  status: true,
  scenario: true,
  seed: true,
  days: true,
  customerCount: true,
  withAi: true,
  progress: true,
  currentVirtualDay: true,
  createdAt: true,
  startedAt: true,
  finishedAt: true,
  failureReason: true,
} satisfies Prisma.SimulationRunSelect;

export interface CreateSimulationRunInput {
  scenario: SimulationScenario;
  seed: number;
  days: number;
  customerCount: number;
  withAi: boolean;
  configuration: Prisma.InputJsonValue;
  createdByUserId: string;
}

/**
 * Simulation Center — reads/writes only the lightweight `SimulationRun`
 * bookkeeping row, which lives in the MAIN database as a platform ledger
 * (status/results/summary JSON). This repository NEVER touches simulated
 * business data — that lives entirely in the separate simulation database,
 * reached only via `bootIsolatedSimulationContext` (§1/§2).
 */
@Injectable()
export class SimulationRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(limit = 50) {
    return this.prisma.simulationRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: LIST_SELECT,
    });
  }

  findOne(id: string) {
    return this.prisma.simulationRun.findUnique({ where: { id } });
  }

  create(input: CreateSimulationRunInput) {
    return this.prisma.simulationRun.create({
      data: {
        scenario: input.scenario,
        status: SimulationStatus.PENDING,
        seed: input.seed,
        days: input.days,
        customerCount: input.customerCount,
        withAi: input.withAi,
        configuration: input.configuration,
        createdByUserId: input.createdByUserId,
      },
      select: LIST_SELECT,
    });
  }

  /** §27/§28 — active means still occupying a concurrency slot. */
  countActive() {
    return this.prisma.simulationRun.count({
      where: {
        status: { in: [SimulationStatus.PENDING, SimulationStatus.RUNNING] },
      },
    });
  }

  /**
   * §28 — cooperative cancel: only flips the flag. The worker itself checks
   * it between days and is what actually stops and marks CANCELLED — this
   * never touches `status` directly, so a run that already finished is
   * simply left alone.
   */
  requestCancel(id: string) {
    return this.prisma.simulationRun.updateMany({
      where: {
        id,
        status: { in: [SimulationStatus.PENDING, SimulationStatus.RUNNING] },
      },
      data: { cancelRequested: true },
    });
  }

  delete(id: string) {
    return this.prisma.simulationRun.delete({ where: { id } });
  }
}
