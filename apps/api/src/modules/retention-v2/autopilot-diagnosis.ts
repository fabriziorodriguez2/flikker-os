/**
 * Diagnóstico de "¿por qué Autopilot no hizo nada?" — la parte pura: qué
 * bloqueos se deducen de los hechos ya reunidos, y a qué hora local cae la
 * corrida diaria del motor. Sin Prisma, para que cada regla sea testeable.
 */

export type AutopilotBlocker =
  | 'BUSINESS_NOT_OPERATIONAL'
  | 'NOT_CHECKIN_V2'
  | 'ENGINE_DISABLED'
  | 'RECOVERY_DISABLED'
  | 'SETTINGS_NOT_INITIALIZED'
  | 'NO_RUNNING_EXPERIMENTS'
  | 'QUEUES_NOT_CONFIGURED'
  | 'DRY_RUN_ENABLED'
  | 'NO_ELIGIBLE_CUSTOMERS'
  | 'PENDING_OUTSIDE_SENDING_WINDOW'
  | 'DAILY_RUN_OUTSIDE_SENDING_WINDOW';

export const BLOCKER_DESCRIPTIONS: Record<AutopilotBlocker, string> = {
  BUSINESS_NOT_OPERATIONAL: 'El negocio está inactivo o archivado.',
  NOT_CHECKIN_V2:
    'El negocio usa la experiencia anterior; Autopilot solo corre en Check-in V2.',
  ENGINE_DISABLED: 'El motor de automatizaciones está apagado para el negocio.',
  RECOVERY_DISABLED: '"Te extrañamos" está desactivado.',
  SETTINGS_NOT_INITIALIZED:
    'Las automatizaciones nunca se configuraron para este negocio.',
  NO_RUNNING_EXPERIMENTS:
    'No hay ninguna campaña automática en curso que pueda reclutar clientes.',
  QUEUES_NOT_CONFIGURED:
    'El servidor no tiene configuradas las tareas programadas: el motor no corre.',
  DRY_RUN_ENABLED:
    'Está en modo prueba: el motor decide pero nunca envía mensajes.',
  NO_ELIGIBLE_CUSTOMERS:
    'Hoy ningún cliente cumple las condiciones para ser contactado.',
  PENDING_OUTSIDE_SENDING_WINDOW:
    'Hay contactos pendientes, pero la corrida diaria cae fuera del horario de envío permitido.',
  DAILY_RUN_OUTSIDE_SENDING_WINDOW:
    'La corrida diaria del motor cae fuera del horario de envío permitido.',
};

export interface DiagnosisFacts {
  businessOperational: boolean;
  isCheckinV2: boolean;
  engineEnabled: boolean;
  settingsInitialized: boolean;
  recoveryEnabled: boolean;
  dryRunEnabled: boolean;
  runningExperiments: number;
  queuesConfigured: boolean;
  eligibleNow: number;
  pendingAssignments: number;
  /** null = no se pudo calcular (cron no estándar). */
  dailyRunWithinSendingWindow: boolean | null;
}

/** Bloqueos en orden de prioridad: el primero es el que hay que resolver antes. */
export function deriveBlockers(facts: DiagnosisFacts): AutopilotBlocker[] {
  const blockers: AutopilotBlocker[] = [];
  if (!facts.businessOperational) blockers.push('BUSINESS_NOT_OPERATIONAL');
  if (!facts.isCheckinV2) blockers.push('NOT_CHECKIN_V2');
  if (!facts.engineEnabled) blockers.push('ENGINE_DISABLED');
  if (!facts.settingsInitialized) blockers.push('SETTINGS_NOT_INITIALIZED');
  else if (!facts.recoveryEnabled) blockers.push('RECOVERY_DISABLED');
  if (facts.runningExperiments === 0) blockers.push('NO_RUNNING_EXPERIMENTS');
  if (!facts.queuesConfigured) blockers.push('QUEUES_NOT_CONFIGURED');
  if (facts.dryRunEnabled) blockers.push('DRY_RUN_ENABLED');
  if (facts.eligibleNow === 0 && facts.pendingAssignments === 0) {
    blockers.push('NO_ELIGIBLE_CUSTOMERS');
  }
  if (facts.dailyRunWithinSendingWindow === false) {
    blockers.push(
      facts.pendingAssignments > 0
        ? 'PENDING_OUTSIDE_SENDING_WINDOW'
        : 'DAILY_RUN_OUTSIDE_SENDING_WINDOW',
    );
  }
  return blockers;
}

/**
 * El instante de HOY en que corre un cron diario simple ("m h * * *") en la
 * zona horaria del servidor. BullMQ interpreta un `repeat.pattern` sin `tz`
 * en la hora local del proceso. Devuelve null para cualquier patrón que no
 * sea un horario diario fijo.
 */
export function dailyCronInstant(
  pattern: string,
  serverTimeZone: string,
  now: Date,
): Date | null {
  const match = /^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*$/.exec(pattern.trim());
  if (!match) return null;
  const minute = Number(match[1]);
  const hour = Number(match[2]);
  if (minute > 59 || hour > 23) return null;

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: serverTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  const guess = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    hour,
    minute,
  );
  return new Date(guess - timeZoneOffsetMs(new Date(guess), serverTimeZone));
}

function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - instant.getTime();
}
