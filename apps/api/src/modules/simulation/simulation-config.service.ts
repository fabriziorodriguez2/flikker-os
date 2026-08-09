import { Injectable, Logger } from '@nestjs/common';

const DEFAULT_MAX_CONCURRENT_RUNS = 1;
const DEFAULT_MAX_CUSTOMERS = 1000;
const DEFAULT_MAX_DAYS = 90;

/**
 * Simulation Center §2/§3/§42 — reads every simulation-related env var once,
 * with safe defaults, and exposes a single `available` read the rest of the
 * module treats as the hard on/off switch for the whole feature.
 *
 * Nothing here throws at boot: an unconfigured Simulation Center is an
 * entirely ordinary, supported deployment state (most environments,
 * including production until explicitly provisioned) — the panel simply
 * reports itself as unavailable rather than the app failing to start.
 *
 * §2 (non-negotiable): this service NEVER falls back to `DATABASE_URL`. If
 * `SIMULATION_DATABASE_URL` is not set, `databaseUrl` is null and `available`
 * is false — there is no code path here that can point a simulation run at
 * the production database.
 */
@Injectable()
export class SimulationConfigService {
  private readonly logger = new Logger(SimulationConfigService.name);

  /** Platform-level kill switch. Safe default: OFF. */
  readonly enabled: boolean;
  /** The separate, simulation-only Postgres connection string, or null. */
  readonly databaseUrl: string | null;
  readonly maxConcurrentRuns: number;
  readonly maxCustomers: number;
  readonly maxDays: number;

  constructor() {
    this.enabled = process.env.SIMULATION_ENABLED === 'true';
    this.databaseUrl = process.env.SIMULATION_DATABASE_URL?.trim() || null;
    this.maxConcurrentRuns = parsePositiveInt(
      process.env.SIMULATION_MAX_CONCURRENT_RUNS,
      DEFAULT_MAX_CONCURRENT_RUNS,
    );
    this.maxCustomers = parsePositiveInt(
      process.env.SIMULATION_MAX_CUSTOMERS,
      DEFAULT_MAX_CUSTOMERS,
    );
    this.maxDays = parsePositiveInt(
      process.env.SIMULATION_MAX_DAYS,
      DEFAULT_MAX_DAYS,
    );

    if (this.enabled && !this.databaseUrl) {
      this.logger.warn(
        'SIMULATION_ENABLED=true but SIMULATION_DATABASE_URL is not set — the Simulation Center will report itself as unavailable until a dedicated simulation database is configured.',
      );
    }
  }

  /**
   * True only when BOTH the kill switch is on AND a dedicated simulation
   * database is configured. Any endpoint that would create or run a
   * simulation must check this first and refuse otherwise (§2/§42).
   */
  get available(): boolean {
    return this.enabled && this.databaseUrl !== null;
  }

  /** Machine-readable reason the panel/API can surface when unavailable. */
  get unavailableReason(): 'DISABLED' | 'DATABASE_NOT_CONFIGURED' | null {
    if (!this.enabled) return 'DISABLED';
    if (!this.databaseUrl) return 'DATABASE_NOT_CONFIGURED';
    return null;
  }
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
