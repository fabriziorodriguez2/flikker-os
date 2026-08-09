# Simulation Center — Informe final

Todos los resultados de este informe provienen de corridas reales, ejecutadas en esta sesión contra Postgres real (nunca mockeado), a través del mismo camino que usa el worker de cola real (`SimulationRunnerService.run()`). Ninguna corrida tocó la base de datos de producción, un `Business` real, ni llamó a WhatsApp/OpenAI reales. Los resultados se reportan tal como salieron, incluidos los que son malos (tasa de acierto de ganador del 10% en el escenario saludable, error de estimación de más del 100% en varias corridas). No se modificó ningún algoritmo real de Flikker (Retention V2, Reward Goals, Safe Auto-Optimization, Check-in V2) para mejorar estos números.

---

## 1. AI Model Recommendation

`OpenAiProviderService` (`src/modules/ai/openai-provider.service.ts`) llama con `fetch` plano a `https://api.openai.com/v1/chat/completions`, con `response_format: { type: 'json_schema', strict: true }`. Ese endpoint y ese modo de `response_format` están confirmados compatibles con `gpt-4o-mini` según la documentación pública de OpenAI (`developers.openai.com`).

**Recomendación: mantener `AI_MODEL=gpt-4o-mini`** (`src/modules/ai/ai-config.service.ts:3` — es el default si `AI_MODEL` no está seteada). Es el único modelo que pude verificar de forma directa contra el endpoint legacy exacto que usa el código actual.

**Lo que no pude verificar**: no tengo forma de confirmar contra este mismo endpoint legacy si un modelo más nuevo/más barato (p. ej. una variante `gpt-4.1-mini` o posterior) es igualmente compatible con `strict: true` sin correrlo contra la cuenta real de OpenAI de Flikker — eso queda fuera de lo que se puede validar desde este entorno aislado. Si se quiere evaluar un modelo distinto, la Simulation Center **no** es el lugar para probarlo con tráfico real: `Run E` (abajo) prueba explícitamente que el camino de IA está bloqueado por diseño dentro de la simulación.

---

## 2. Environment Variables

Ninguna de las siguientes son secretos reales — son nombres de variables, no valores.

**LOCAL APP** (ya existentes, sin cambios):
- `DATABASE_URL` — Postgres de producción/desarrollo real.
- `AI_MODEL` — default `gpt-4o-mini` si no está seteada.
- `OPENAI_API_KEY` — clave real de OpenAI (nunca usada por la simulación — ver §4).
- `AI_ENABLED` — flag real de la app (nunca usado por la simulación — ver §4).

**SIMULATION** (nuevas, todas opcionales — sin ellas el módulo se reporta como no disponible):
- `SIMULATION_ENABLED` — `'true'` para habilitar el módulo. Default: deshabilitado.
- `SIMULATION_DATABASE_URL` — cadena de conexión a una base Postgres **separada y dedicada** (en esta sesión: `flikker_simulation`). Sin esto, `available: false` y el panel se muestra como "no configurado", nunca falla.
- `SIMULATION_MAX_CONCURRENT_RUNS` — tope de corridas simultáneas (entero).
- `SIMULATION_MAX_CUSTOMERS` — tope de clientes por corrida (entero; usado como `1000` en las corridas de este informe).
- `SIMULATION_MAX_DAYS` — tope de días virtuales por corrida (entero; usado como `90`).

**AI OPTIONAL** (dentro de la simulación): no existen variables nuevas — el mecanismo de aislamiento (§4) fuerza `OPENAI_API_KEY=''` y `AI_ENABLED='false'` en el proceso durante toda la ventana de arranque del contexto aislado, sin importar lo que la corrida pida (`withAi: true/false`). El "AI opcional" de una corrida se resuelve enteramente contra `FakeAiProvider` (`src/modules/simulation/fake-ai-provider.ts`), nunca contra la red.

---

## 3. Simulation Architecture

La Simulation Center es un módulo autocontenido bajo `src/modules/simulation/`, separado de `src/jobs/`. Reutiliza sin modificar los servicios reales de negocio:

- `RetentionV2EvaluateService.runDaily` — recluta clientes en variantes.
- `RetentionV2SendService.processAssignment` — envía (o salta) el mensaje del día.
- `RetentionOutcomeService.runOnce` — resuelve outcomes de asignaciones.
- `RewardGoalSweepService.runDaily` / `RewardGoalOrchestratorService.afterVisit` — crea/avanza Reward Goals.
- `RetentionOptimizationService.sweepAutomatic` — Safe Auto-Optimization (Fase G).
- `RetentionExperimentMetricsService.forExperiment()` — los mismos números que ve el dashboard real de Fase D.

El motor (`SimulationEngineService`) corre un loop diario de 9 pasos (Reward Goals sweep → reclutamiento → envío → entrega fake de WhatsApp → mapa de exposición ground-truth → visitas físicas/visibles → redenciones → outcomes → Safe Auto-Optimization), avanzando el reloj virtual un día por iteración. `VisitsRepository.registerVisit` se llama directo (bypasea `CheckinService` para no disparar mensajería/sesión real). `FakeWhatsappTransport` entrega los mensajes porque no hay un worker real de `Message` corriendo en el contexto aislado.

---

## 4. Isolation

Todo pasa por **una única función**, `bootIsolatedSimulationContext` (`simulation-context.ts`): antes de cada `NestFactory.createApplicationContext()`, swapea `process.env.DATABASE_URL` → `SIMULATION_DATABASE_URL`, y además blanquea `OPENAI_API_KEY=''` y fuerza `AI_ENABLED='false'`, por la duración exacta de esa ventana de arranque — restaurado siempre en un `finally`. Los boots se serializan con una cola de promesas en proceso, así que dos arranques nunca pueden solaparse la ventana de swap.

Esto es lo único que hace falta revisar para confiar en el aislamiento: mientras `PrismaService` se resuelva dentro de esa ventana, apunta exclusivamente a la base aislada, y ninguna llamada de IA real puede salir, sin importar qué pida la corrida.

---

## 5. Virtual Clock

`SimulationClock` (`simulation-clock.ts`) es un reloj puramente virtual: `now()`, `advanceHours()`, `advanceDays()`, `currentVirtualDay`. Nunca usa el reloj real del sistema para decidir nada de negocio.

**Bug encontrado y corregido en esta sesión** (ver §16, Bug #1): el default original arrancaba a las 08:00 hora Montevideo — antes del `sendingHourStart` default (10) de `RetentionSettings` — por lo que **ninguna corrida real, en ningún momento de esta sesión antes del fix, había enviado un solo mensaje real**. Corregido a las 14:00 hora Montevideo, con una regla de regresión que verifica los 90 días virtuales dentro de la ventana 10–20.

---

## 6. Scenarios

10 escenarios (`SimulationScenario` enum, `SCENARIO_DEFINITIONS`): `BASELINE_HEALTHY`, `LOW_CHECKIN_COMPLIANCE`, `HIGH_CHECKIN_COMPLIANCE`, `PROMO_SENSITIVE`, `PROGRESS_SENSITIVE`, `HIGH_CHURN`, `LOW_BUDGET`, `AI_PROVIDER_FAILURE`, `MESSAGE_PROVIDER_FAILURE`, `OPTIMIZATION_STRESS`. Cada uno resuelve a un `ScenarioDefinition` completo (negocio, incentivos, mix de personas, allocation del experimento, inyección de fallas) vía `resolveScenarioDefinition(scenario, overrides, limits)`, que aplica overrides del admin con clamping contra los límites configurados.

**Bug encontrado y corregido en esta sesión** (ver §16, Bug #3): todos los escenarios excepto `LOW_BUDGET` compartían `budgetCaps: { null, null }` — que `RetentionBudgetService` trata, correcta y deliberadamente, como "no emitir nada automático". Corregido a un cap generoso (`{300, 50000}`) para que los escenarios "saludables" efectivamente ejerciten el brazo SOFT_BENEFIT.

---

## 7. Ground Truth

`personas.ts` define 9 personas (`PersonaProfile`) con cadencia, jitter, compliance base de check-in, efecto de cada tipo de mensaje, y hazard de churn. `DEFAULT_PERSONA_MIX` suma 1. La persona de cada cliente se asigna en el seeding y se devuelve solo en memoria (`SeededCustomer[]`) — **nunca se persiste en ninguna fila real**, es lo único que existiría "trucado" si se guardara, y deliberadamente no se guarda.

`computeGroundTruth` (`simulation-ground-truth.ts`) calcula el efecto promedio poblacional por variante y el `trueWinner` determinístico (empate favorece `REMINDER` > `PROGRESS_REMINDER` > `SOFT_BENEFIT`, en ese orden).

---

## 8. Admin Panel

`/platform/simulations` en el frontend (Next.js), consumido a través del proxy autenticado genérico ya existente (`app/api/proxy/[...path]/route.ts` — no se agregó ningún route handler nuevo). Lista + formulario de creación, y detalle con polling, resultados, diagnóstico y JSON crudo.

Backend: `SimulationController` (`platform/simulations`), guardado por `JwtGuard` + `PlatformAdminGuard` — **sin excepciones**, no hay tenant/business scoping porque el módulo nunca toca un `Business` real.

- `GET /platform/simulations/status` — disponibilidad del módulo.
- `GET /platform/simulations` — lista de corridas.
- `GET /platform/simulations/:id` — estado/progreso/resultados de una corrida.
- `POST /platform/simulations` — crea la fila `PENDING` y encola; no bloquea.
- `POST /platform/simulations/:id/cancel` — cancelación cooperativa.

---

## 9. Queue

BullMQ, cola dedicada `simulation-run` (`SIMULATION_QUEUE`, `simulation.queue.ts`), autocontenida en `src/modules/simulation/` (no en `src/jobs/`). `SimulationWorker.process()` invoca `SimulationRunnerService.run(simulationRunId)`. Este módulo no usa Redis/BullMQ real en este sandbox (no está configurado `REDIS_URL`/`REDIS_HOST`) — por eso todas las corridas de este informe se ejecutaron llamando `SimulationRunnerService.run()` directamente, exactamente el mismo código que el worker real llamaría, sin pasar por Redis.

---

## 10. Result Model

`SimulationRun.results` (JSON) y `SimulationRun.summary` (JSON) en la base **principal** (nunca en la aislada). Campos relevantes de `results`: `trueWinner`, `detectedWinner`, `winnerAccuracy` (`CORRECT`/`NO_CONCLUSION`/`INCORRECT`), `checkinVisibilityRate`, `estimationErrorPercent` (null si `trueIncrementalRevenue===0`), `trueIncrementalRevenue`, `estimatedIncrementalRevenue`, `promotionalCost`, `returnRateByVariant`/`estimatedEffectByVariant`/`trueEffectByVariant`, `rewardGoalsCreated/Unlocked/Redeemed`, `retentionAssignments`, `messagesSent/Delivered/Read/Failed`, `optimizationRunsApplied/Skipped`, `aiCalls`, `invariantResults` (12 checks, ver §11).

---

## 11. Invariants

12 checks (`SimulationInvariantService`), cada uno con `{code, status: PASS|WARN|FAIL, message, critical}`:

| Código | Crítico |
|---|---|
| `SIMULATION_DATABASE_ISOLATED` | sí |
| `NO_LEGACY_BUSINESS_PROCESSED_BY_V2` | sí |
| `ALLOCATION_SUMS_TO_100` | sí |
| `CONTROL_FLOOR_RESPECTED` | sí |
| `EXPLORATION_FLOOR_RESPECTED` | sí |
| `MONTHLY_INCENTIVE_COUNT_WITHIN_LIMIT` | sí |
| `MONTHLY_INCENTIVE_COST_WITHIN_LIMIT` | sí |
| `NO_DUPLICATE_MESSAGE_PER_ASSIGNMENT` | sí |
| `NO_DUPLICATE_BENEFIT_PARTICIPATION` | sí |
| `MAX_ONE_ACTIVE_REWARD_GOAL_PER_CUSTOMER` | no |
| `NO_ASSIGNMENT_MULTIPLE_VARIANT` | sí |
| `AI_USAGE_WITHIN_MAX_CALLS` | sí |

**Los 12 invariantes pasaron PASS en las 14 corridas reales de este informe** (Run A, los 10 seeds de Run B, C, D, E) — incluida Run E, donde el fallo de IA inyectado se maneja con gracia sin violar el cap de llamadas.

---

## 12. Diagnosis

`diagnose()` (puro, determinístico) produce `overallStatus` (PASS/PASS_WITH_WARNINGS/FAIL) y `pilotReadiness` (PILOT_READY/_WITH_WARNINGS/NOT_READY). Solo un invariante `critical:true` en FAIL fuerza FAIL/NOT_READY. Condiciones de warning (visibilidad <0.5, error de estimación >30%, ganador INCORRECTO) solo degradan a PASS_WITH_WARNINGS/PILOT_READY_WITH_WARNINGS — nunca a FAIL.

---

## 13. Comparison — Run C (LOW_CHECKIN_COMPLIANCE) vs Run D (HIGH_CHECKIN_COMPLIANCE)

Mismo negocio base, mismos 500 clientes, misma semilla (42), mismos 60 días — la única diferencia real entre C y D es `failureInjection.checkinComplianceRate`.

| Métrica | Run C (LOW) | Run D (HIGH) |
|---|---|---|
| `checkinVisibilityRate` | **27.2%** | **84.5%** |
| `winnerAccuracy` | INCORRECT | INCORRECT |
| `estimationErrorPercent` | 12.7% | **260.9%** |
| `trueIncrementalRevenue` | $2,610.84 | $4,120.01 |
| `estimatedIncrementalRevenue` | $2,280.00 | $14,869.57 |
| `promotionalCost` | $780 | $2,580 |
| `physicalReturns` / `visibleReturns` | 2016 / 548 | 1952 / 1649 |

**Hallazgo honesto**: la visibilidad del check-in se comporta exactamente como se espera (el mecanismo de inyección de fallas funciona correctamente), pero **más visibilidad no mejoró la precisión del ganador detectado** — ambas corridas fallan en identificar `SOFT_BENEFIT` como el verdadero ganador. Peor aún, el error de estimación económica **empeoró** con más visibilidad (12.7% → 260.9%), no mejoró — con más exposición, las estimaciones de revenue incremental se vuelven más volátiles relativas al (todavía pequeño) revenue real, no más precisas. Ver §17 para el análisis de por qué.

---

## 14. Tests

- **Módulo `src/modules/simulation`**: 187/187 tests pasan (21 suites; 8 tests de integración se saltan sin `SIMULATION_DATABASE_URL`, correctamente, nunca fallan).
- **Typecheck** (`npx tsc --noEmit`): limpio salvo 2 errores preexistentes y no relacionados (`tenant.guard.spec.ts`, `auth.service.spec.ts` — ninguno tocado en este trabajo).
- **Lint** (`npx eslint src/modules/simulation --fix`): limpio.
- **Regresión completa de la app** (`npx jest --runInBand`, con `.env` cargado): 129/135 suites, 1196/1255 tests — exactamente las mismas 6 suites preexistentes y no relacionadas (`businesses`, `auth`, `campaigns`, `widgets`, `metrics`, `google-calendar-parser`) fallando antes y después de todo este trabajo. +1 test nuevo (regresión de Bug #6), pasando.

---

## 15. Results A–E

### Run A — BASELINE_HEALTHY (60 días, 500 clientes, seed 42, sin IA, `optimizationMode: AUTOMATIC`)

`SimulationRun id: aae331b2-cd98-4109-a05b-3e08bce78e5f`

- `winnerAccuracy: CORRECT` (`detectedWinner.kind: BEST_INCREMENTAL_VALUE` coincide con `trueWinner: SOFT_BENEFIT`).
- `checkinVisibilityRate: 66.9%`.
- `estimationErrorPercent: 122.8%` → warning `HIGH_ESTIMATION_ERROR`.
- `trueIncrementalRevenue: $3,666.23` vs `estimatedIncrementalRevenue: $8,169.23`.
- `promotionalCost: $1,740` (no cero — confirma el fix de Bug #5).
- `rewardGoalsCreated: 500`, `rewardGoalsUnlocked: 390`, `rewardGoalsRedeemed: 389` (≤ unlocked, consistente — confirma el fix de Bug #6).
- 12/12 invariantes PASS. `overallStatus: PASS_WITH_WARNINGS`, `pilotReadiness: PILOT_READY_WITH_WARNINGS`.

### Run B — BASELINE_HEALTHY × 10 semillas (60 días, 500 clientes cada una, sin IA, `AUTOMATIC`)

Agregado §24 sobre los 10 seeds:

```json
{
  "n": 10,
  "correctWinnerRate": 0.1,
  "noConclusionRate": 0.1,
  "incorrectWinnerRate": 0.8,
  "safetyFailureRate": 0,
  "meanVisibility": 0.6697,
  "meanEstimationError": 157.51,
  "meanNetValue": 1419.09
}
```

**Este es el hallazgo más importante de todo el ejercicio**: en el escenario "saludable" de referencia, corrido 10 veces con la única diferencia siendo la semilla aleatoria, Flikker identifica correctamente al verdadero ganador solo **1 de cada 10 veces**. Falla incorrectamente 8 de 10. El error de estimación económica promedio es de 157.5%. Al mismo tiempo, **ninguna corrida violó ningún invariante de seguridad crítico** (`safetyFailureRate: 0`) — los guardrails (allocation floors, budget caps, no-duplicados) se mantienen siempre, incluso cuando la detección estadística del ganador es poco confiable.

### Run C — LOW_CHECKIN_COMPLIANCE (60 días, 500 clientes, seed 42, sin IA, `AUTOMATIC`)

`SimulationRun id: 2b4110a5-8e26-4ad0-ba48-3399e9901a28` — ver §13.

### Run D — HIGH_CHECKIN_COMPLIANCE (60 días, 500 clientes, seed 42, sin IA, `AUTOMATIC`)

`SimulationRun id: 29064785-259d-4008-a4a9-d52507b1f8f1` — ver §13.

### Run E — AI_PROVIDER_FAILURE (30 días, 100 clientes, seed 42, IA activada con falla inyectada, máx. 20 llamadas)

`SimulationRun id: ded1ba49-d4a2-4852-9c74-dd2f36bc0933`

- `aiCalls: 0` — confirmado: el proveedor de IA falso falló en cada intento (por diseño del escenario), y **en ningún momento se llamó a la OpenAI real** (§4 lo garantiza estructuralmente, no solo por configuración del escenario).
- `winnerAccuracy: NO_CONCLUSION` con `reason: CONTROL_INSUFFICIENT_DATA` — comportamiento correcto: con una muestra chica (100 clientes/30 días) el sistema correctamente se abstiene de forzar una conclusión.
- 12/12 invariantes PASS, incluido `AI_USAGE_WITHIN_MAX_CALLS` ("0 AI call(s) recorded, within the 20 cap").
- `overallStatus: PASS_WITH_WARNINGS`, `pilotReadiness: PILOT_READY_WITH_WARNINGS`.

---

## 16. Bugs Found

Los 6 bugs encontrados son **todos del arnés de Simulation Center** (seeder/motor/escenarios de esta herramienta interna) — **ninguno es un bug de producción de Flikker**. En cada caso, el servicio real de Flikker involucrado se comportó exactamente como está diseñado y documentado en su propio código; el bug era que la simulación no lo estaba alimentando con datos realistas.

1. **Reloj fuera de la ventana de envío**: `SimulationClock` arrancaba a las 08:00 hora local, antes del `sendingHourStart` default (10) de `RetentionSettings`. `RetentionV2SendService.isWithinSendingWindow` (real, sin tocar) rechazaba correctamente todos los envíos, todos los días. Confirmado con una query directa: 234 `RetentionAssignment` atascadas en `PENDING`/`skipReason: null`. **Corregido**: default del reloj movido a las 14:00 local.

2. **`rewardGoalEligible` nunca seteado**: el seeder nunca activaba este flag (separado de `automationEligible`, default `false`) en `RetentionIncentiveDefinition`. `RewardGoalEngineService.findEligibleIncentiveIds()` encontraba cero incentivos elegibles siempre, dejando `rewardGoalsCreated: 0` en toda corrida. **Corregido**: `rewardGoalEligible: true` agregado al seeder.

3. **Budget caps deny-by-default**: `RetentionBudgetService` trata `{null, null}` como "no emitir nada automático" (comportamiento real e intencional de Flikker). Todos los escenarios salvo `LOW_BUDGET` compartían ese default, por lo que SOFT_BENEFIT nunca podía emitir nada en ningún escenario "sano". **Corregido**: cap generoso `{300, 50000}` para `BASELINE_BUSINESS`.

4. **Reward Goal sweep corría después del envío del mismo día**: `sendProgressReminder` descarta terminalmente (sin reintento) cualquier asignación PROGRESS_REMINDER sin una Reward Goal ACTIVA en ese instante. El motor corría el sweep (que crea goals) después del envío, dejando invisible para el envío del mismo día la meta recién creada ese mismo día. **Corregido**: el sweep ahora es el paso 1, antes del reclutamiento y el envío. **Nota**: esta corrección no resolvió completamente la baja exposición de PROGRESS_REMINDER — ver §17, es una interacción de diseño real, no un bug residual del arnés.

5. **Incentivo incorrecto para el costo de SOFT_BENEFIT**: el seeder tomaba `Object.values(incentiveIdByCode)[0]` — en la práctica siempre "UPGRADE", que no tiene `percentageValue`/`fixedValue`/`estimatedCost`. `estimateIncentiveCost` (real, sin tocar) devolvía correctamente `null`, dejando `promotionalCost`/`estimatedIncrementalRevenue` en cero para todo el brazo SOFT_BENEFIT incluso cuando ya se estaba ejerciendo. **Corregido**: se prefiere `PERCENT_OFF_10` (tiene `percentageValue` real). Confirmado con Run A definitiva: `promotionalCost: $1,740` (antes: $0).

6. **`rewardGoalsRedeemed` mezclaba dos orígenes distintos**: la query de redención (`benefitParticipation.findMany({ redeemedAt: null })`) no distinguía entre participaciones creadas por Reward Goals y las creadas por el brazo SOFT_BENEFIT de Retention V2 — ambas se redimen (correcto, es lo esperado), pero el conteo se acumulaba entero en una variable llamada `rewardGoalsRedeemed`. Evidencia: una corrida mostró `rewardGoalsRedeemed(480) > rewardGoalsUnlocked(408)`, imposible si el campo fuera exclusivamente de reward goals. **Corregido**: se sigue redimiendo todo por igual, pero solo se cuenta en `rewardGoalsRedeemed` lo efectivamente ligado a una `CustomerRewardGoal` (vía el back-relation `rewardGoal`). Confirmado con Run A definitiva: `rewardGoalsRedeemed(389) ≤ rewardGoalsUnlocked(390)`.

---

## 17. Algorithm Concerns

Estos son hallazgos reales sobre cómo se comporta la lógica real de Flikker bajo simulación — **no son bugs de la simulación, y no se "arreglaron"** porque hacerlo violaría la instrucción de no tocar algoritmos para mejorar resultados artificialmente.

**Baja tasa de acierto del ganador con este tamaño de muestra (Run B)**: con 500 clientes / 60 días / la allocation por defecto (15/30/25/30), Flikker identifica correctamente al ganador solo 10% de las veces, incorrectamente 80%, sin conclusión 10%. Los efectos verdaderos de REMINDER (6.9%), SOFT_BENEFIT (8.2%) y PROGRESS_REMINDER (7.4%) están a menos de 1.3 puntos porcentuales entre sí — la potencia estadística de este tamaño de muestra/duración no alcanza para distinguirlos con confianza, aunque los guardrails de seguridad (allocation floors, budget caps, no-duplicados) se mantuvieron intactos en las 10 corridas sin excepción.

**El error de estimación empeora con más visibilidad, no mejora (Run C vs D)**: contraintuitivamente, más check-ins visibles (84.5% vs 27.2%) llevó a un error de estimación económica *peor* (260.9% vs 12.7%), no mejor. Con más exposición hay más asignaciones tratadas y más eventos de incentivo, lo que amplifica la varianza de las estimaciones de revenue relativas a un revenue verdadero que sigue siendo chico en términos absolutos — la métrica de error relativo es sensible a esa varianza cuando el denominador (`trueIncrementalRevenue`) es pequeño, no cuando la muestra es formalmente más grande.

**PROGRESS_REMINDER estructuralmente en desventaja frente a Reward Goals**: `REWARD_GOAL_TARGET_RANGE[AT_RISK] = null` e `[INACTIVE] = null`, por diseño explícito y documentado ("AT_RISK/INACTIVE son problema del Retention Engine, no de un contador de visitas visible"). `sendProgressReminder` requiere una `CustomerRewardGoal` ACTIVA para tener algo que recordar, y PROGRESS_REMINDER se recluta específicamente para clientes AT_RISK. El resultado: un cliente solo puede recibir un PROGRESS_REMINDER válido si todavía conserva una meta sin vencer de *antes* de caer en AT_RISK — una ventana de solapamiento angosta y dependiente del timing. Esto es una tensión de diseño real y legítima entre dos features cada una correcta en su propio spec, no algo para forzar dentro de la simulación (forzarlo significaría emitir goals a clientes AT_RISK, que `decideRewardGoal` rechaza deliberadamente).

---

## 18. Pilot Readiness

**`PILOT_READY_WITH_WARNINGS` en las 14 corridas reales de este informe** — nunca `NOT_READY`, porque ningún invariante crítico falló en ninguna corrida. Pero "listo con warnings" no debe leerse como "listo sin reservas":

- Los guardrails de seguridad (tenancy, allocation floors, budget caps, no-duplicados, límites de IA) se sostienen consistentemente — esto es lo que hace seguro pilotear.
- La confiabilidad estadística de "qué variante ganó" y "cuánto revenue generó" es baja con el tamaño de muestra/duración probado (Run B: 80% de detecciones incorrectas). **No se debería tomar una decisión de negocio irreversible basada en el ganador detectado de un solo experimento con esta muestra**, y las proyecciones económicas deben tratarse como orientativas, no exactas — exactamente lo que las recomendaciones automáticas de `diagnose()` ya dicen en cada corrida.
- Recomendación concreta antes de un piloto real: correr experimentos por más tiempo/con más clientes de los usados aquí antes de confiar en `optimizationMode: AUTOMATIC`, o mantenerlo en `ASSISTED` hasta acumular más muestra.

---

## 19. Exact commands / setup needed

```bash
# Variables de entorno (ver §2)
export SIMULATION_ENABLED=true
export SIMULATION_DATABASE_URL="postgres://.../flikker_simulation"
export SIMULATION_MAX_CONCURRENT_RUNS=1
export SIMULATION_MAX_CUSTOMERS=1000
export SIMULATION_MAX_DAYS=90

# Tests del módulo
cd apps/api
npx jest --runInBand src/modules/simulation

# Una corrida puntual (igual camino que el worker real)
npx ts-node scripts-scratch/run-mandatory-simulation.ts <LABEL> <SCENARIO> <DAYS> <CUSTOMERS> [SEED] [WITH_AI] [OPT_MODE]
# ejemplo:
npx ts-node scripts-scratch/run-mandatory-simulation.ts A BASELINE_HEALTHY 60 500 42 false AUTOMATIC

# Un batch de N semillas con agregado §24
npx ts-node scripts-scratch/run-batch-simulation.ts <LABEL> <SCENARIO> <DAYS> <CUSTOMERS> <NUM_SEEDS> [FIRST_SEED] [WITH_AI] [OPT_MODE]
# ejemplo:
npx ts-node scripts-scratch/run-batch-simulation.ts B BASELINE_HEALTHY 60 500 10 1 false AUTOMATIC
```

Ambos scripts viven en `apps/api/scripts-scratch/` (fuera del repo trackeado — son herramientas de este informe, no un endpoint ni feature nuevos) y limpian automáticamente el `Business` simulado aislado al terminar, dejando solo la fila `SimulationRun` (bookkeeping + resultados) en la base principal para trazabilidad.

Panel real: `/platform/simulations` en el frontend, solo accesible como Platform Admin.

---

**Corridas finales conservadas en la base principal** (14 filas `SimulationRun`, ver §15): Run A (`aae331b2-...`), Run B seeds 1–10, Run C (`2b4110a5-...`), Run D (`29064785-...`), Run E (`ded1ba49-...`). Se eliminaron 6 filas de iteraciones previas/superadas de esta misma sesión (pre-fix o de prueba humo) junto con sus usuarios descartables asociados — nunca se tocó ninguna fila de producción.
