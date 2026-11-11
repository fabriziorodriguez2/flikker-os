import {
  dailyCronInstant,
  deriveBlockers,
  type DiagnosisFacts,
} from './autopilot-diagnosis';

const healthy: DiagnosisFacts = {
  businessOperational: true,
  isCheckinV2: true,
  engineEnabled: true,
  settingsInitialized: true,
  recoveryEnabled: true,
  dryRunEnabled: false,
  runningExperiments: 3,
  queuesConfigured: true,
  eligibleNow: 4,
  pendingAssignments: 0,
  dailyRunWithinSendingWindow: true,
};

describe('deriveBlockers', () => {
  it('sin bloqueos cuando todo está en orden', () => {
    expect(deriveBlockers(healthy)).toEqual([]);
  });

  it('ordena por lo que hay que resolver primero', () => {
    expect(
      deriveBlockers({
        ...healthy,
        isCheckinV2: false,
        engineEnabled: false,
        runningExperiments: 0,
      }),
    ).toEqual(['NOT_CHECKIN_V2', 'ENGINE_DISABLED', 'NO_RUNNING_EXPERIMENTS']);
  });

  it('negocio con clientes recientes: nadie elegible todavía', () => {
    expect(deriveBlockers({ ...healthy, eligibleNow: 0 })).toEqual([
      'NO_ELIGIBLE_CUSTOMERS',
    ]);
  });

  it('pendientes trabados porque la corrida diaria cae fuera de horario', () => {
    expect(
      deriveBlockers({
        ...healthy,
        eligibleNow: 0,
        pendingAssignments: 7,
        dailyRunWithinSendingWindow: false,
      }),
    ).toEqual(['PENDING_OUTSIDE_SENDING_WINDOW']);
  });

  it('sin settings no reporta Te extrañamos apagado: reporta que nunca se configuró', () => {
    expect(
      deriveBlockers({
        ...healthy,
        settingsInitialized: false,
        recoveryEnabled: false,
      }),
    ).toEqual(['SETTINGS_NOT_INITIALIZED']);
  });

  it('modo prueba y colas no configuradas', () => {
    expect(
      deriveBlockers({
        ...healthy,
        dryRunEnabled: true,
        queuesConfigured: false,
      }),
    ).toEqual(['QUEUES_NOT_CONFIGURED', 'DRY_RUN_ENABLED']);
  });
});

describe('dailyCronInstant', () => {
  const now = new Date('2026-11-10T15:00:00Z');

  it('09:00 en un servidor UTC son las 06:00 en Montevideo', () => {
    const instant = dailyCronInstant('0 9 * * *', 'UTC', now);
    expect(instant?.toISOString()).toBe('2026-11-10T09:00:00.000Z');
    const localHour = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Montevideo',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(instant!);
    expect(localHour).toBe('06');
  });

  it('respeta la zona horaria del servidor', () => {
    expect(
      dailyCronInstant('30 9 * * *', 'America/Montevideo', now)?.toISOString(),
    ).toBe('2026-11-10T12:30:00.000Z');
  });

  it('patrones no diarios no se interpretan', () => {
    expect(dailyCronInstant('0 */4 * * *', 'UTC', now)).toBeNull();
    expect(dailyCronInstant('0 25 * * *', 'UTC', now)).toBeNull();
  });
});
