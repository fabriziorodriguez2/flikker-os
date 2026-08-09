import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext, Type } from '@nestjs/common';

/**
 * §1/§2 — the ONE place a simulation is allowed to point Prisma at a
 * different database. `PrismaService`'s constructor reads
 * `process.env.DATABASE_URL` directly and is otherwise left completely
 * unchanged (see `prisma/prisma.service.ts`) — this helper takes advantage
 * of exactly that single read, for exactly the window a brand-new,
 * disposable `NestFactory.createApplicationContext()` boot needs it, then
 * restores the real value. No PrismaService/PrismaModule/business-module
 * source is touched to make this work — that is the whole point (CLAUDE.md
 * §5: mínima adaptación necesaria).
 *
 * §4/§43 — the same swap ALSO blanks `OPENAI_API_KEY`/`AI_ENABLED` for the
 * boot window. Reason: once a simulation root module needs a real business
 * module that (transitively, unchanged) imports the real `AiModule` —
 * `RetentionV2Module` does, for `RetentionAiCopyService` — that module's
 * `OpenAiProviderService` is a normal (non-`@Global()`) provider, so it
 * cannot be DI-overridden from a sibling module without editing
 * `retention-v2.module.ts`. `AiConfigService` reads those two env vars at
 * construction time exactly like `PrismaService` reads `DATABASE_URL` — so
 * blanking them for the same window makes `providerConfigured` false
 * unconditionally, regardless of whatever the REAL production environment
 * has configured for its own AI features. A simulation that wants to
 * exercise AI behavior validates the fake provider's contract directly
 * (§17) rather than relying on this real provider ever being reachable.
 *
 * Because the main app's own `PrismaService`/`AiConfigService` singletons
 * are constructed once, at real app boot, long before any simulation ever
 * runs, mutating these env vars afterwards can never retroactively change
 * their already-resolved state — the swap only affects whatever gets
 * constructed *during* the swap window.
 *
 * Boots are serialized through a private in-process queue so two
 * overlapping calls (e.g. a misconfigured `SIMULATION_MAX_CONCURRENT_RUNS`)
 * can never interleave the swap window and leak the wrong values into the
 * wrong context. This is the load-bearing isolation guarantee, so it is
 * never left to "should be fine because callers behave."
 */
let bootQueue: Promise<unknown> = Promise.resolve();

export function bootIsolatedSimulationContext(
  rootModule: Type<unknown>,
  simulationDatabaseUrl: string,
): Promise<INestApplicationContext> {
  const run = bootQueue.then(() => bootNow(rootModule, simulationDatabaseUrl));
  // Swallow here so one failed boot doesn't poison the queue for the next
  // caller — the caller of THIS function still observes its own rejection
  // through the promise `bootIsolatedSimulationContext` itself returns.
  bootQueue = run.catch(() => undefined);
  return run;
}

const SWAPPED_ENV_KEYS = [
  'DATABASE_URL',
  'OPENAI_API_KEY',
  'AI_ENABLED',
] as const;

async function bootNow(
  rootModule: Type<unknown>,
  simulationDatabaseUrl: string,
): Promise<INestApplicationContext> {
  const original: Record<string, string | undefined> = {};
  for (const key of SWAPPED_ENV_KEYS) original[key] = process.env[key];

  process.env.DATABASE_URL = simulationDatabaseUrl;
  process.env.OPENAI_API_KEY = '';
  process.env.AI_ENABLED = 'false';
  try {
    return await NestFactory.createApplicationContext(rootModule, {
      logger: false,
    });
  } finally {
    for (const key of SWAPPED_ENV_KEYS) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
}
