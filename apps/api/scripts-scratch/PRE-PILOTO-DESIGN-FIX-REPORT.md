# Fix de diseño pre-piloto — Informe final (corregido)

Todos los números de este informe provienen de corridas reales ejecutadas contra Postgres real, por el mismo camino que usa el worker de cola real (`SimulationRunnerService.run()`). Ninguna corrida tocó producción, un `Business` real, ni llamó a WhatsApp/OpenAI reales. Las corridas D2 usan **6 seeds** por escenario en vez de 20 (decisión explícita del usuario por costo de tiempo, señalada en cada tabla). Ningún threshold ni el ground truth se ajustó después de ver un resultado para mejorarlo. **Esta versión corrige dos cosas de la anterior**: (1) separa ganador por retorno de ganador económico en vez de un solo `winnerAccuracy`, y con eso reinterpreta correctamente STRONG_SIGNAL; (2) corrige la atribución de uno de los tres bugs — no era del arnés de Simulation Center, era de código real de producción.

---

## Tabla comparativa — ANTES vs. DESPUÉS

| | **ANTES** (batch anterior, BASELINE_HEALTHY, 4 brazos, 10 seeds) | **DESPUÉS** |
|---|---|---|
| correctWinnerRate (legacy, un solo lente) | **10%** | TWO_ARM_REMINDER: **100%** · TWO_ARM_SOFT_BENEFIT: **100%** · REWARD_PROGRESS: **100%** (6 seeds c/u) |
| returnWinnerCorrectRate | n/a (no existía) | STRONG_SIGNAL: **100%** (6/6 seeds — Flikker identifica correctamente a SOFT_BENEFIT como mejor por retorno, siempre) |
| economicWinnerCorrectRate | n/a (no existía) | STRONG_SIGNAL: **0%** (6/6 seeds — ver sección dedicada abajo) |
| noConclusionRate | 10% | 0% en todos los escenarios D2 |
| meanEstimationError | 157.5% | 63-137% según escenario (sigue alto — ver Algorithm Concerns) |
| safetyFailureRate | 0% | **0% en las 6 corridas D2, sin excepción** |
| automaticAppliedRate | n/a | NEAR_TIE: **16.7%** (se abstiene, correcto) · STRONG_SIGNAL: **33.3%** |
| progressSkippedNoGoal | n/a | REWARD_PROGRESS: **0** (total, 6 seeds) |

---

## Progress Reminder design change

Se agregó `RetentionObjective.REWARD_GOAL_PROGRESS` (nuevo valor de enum, migración chica). Un experimento con este objective solo admite variantes `CONTROL`/`PROGRESS_REMINDER` — `RetentionExperimentsAdminService.validateStrategyForObjective` lo rechaza en creación/edición (solo cuando la variante realmente cambia — nunca retroactivo). `sendProgressReminder` no se tocó: sigue leyendo el goal real y nunca inventa progreso.

## Recruitment population

Nuevo método `RetentionV2EvaluateService.evaluateBusinessForRewardGoalProgress` — no reutiliza `objectiveForSegment`/`resolveApplicable` (1:1 con `CustomerSegment`; esta población — "tiene una `CustomerRewardGoal` ACTIVE y sin vencer" — es ortogonal al segmento). La población se resuelve en una sola query, y CONTROL/PROGRESS_REMINDER se asignan desde ese mismo resultado vía `pickVariant`. `eligibility.ts` se generalizó de forma aditiva (`segment: CustomerSegment | null`), reutilizando consentimiento/cooldown/límite mensual sin un segundo motor de frecuencia.

## Causal validity

**Bug real encontrado y corregido — en código de producción real, no en el arnés** (corrección respecto al informe anterior, ver "Bugs encontrados — atribución correcta" más abajo): `RetentionV2SendService.processAssignment` — el re-check real que corre inmediatamente antes de cada envío en producción — volvía a llamar `evaluateEligibility` con el segmento real del cliente sin condicionar por objective. Como los clientes de `REWARD_GOAL_PROGRESS` nunca son AT_RISK/INACTIVE, el 100% de sus asignaciones PROGRESS_REMINDER terminaban `SKIPPED: SEGMENT_NOT_TARGETABLE`, silenciosamente. **Esto habría roto la feature en un negocio real si se hubiera lanzado sin este arreglo** — no era un artefacto de simulación. Encontrado con una corrida diagnóstica real (`progressMessagesSent: 0` con `progressAssignments: 40+`). Corregido: `segment: experiment.objective === REWARD_GOAL_PROGRESS ? null : assignment.segmentAtAssignment`. Confirmado con la misma corrida: `MESSAGE_QUEUED: 45`, `status: SENT`. Test de regresión agregado en `retention-v2-send.service.spec.ts`.

## Clear-winner gate

`selectOptimizationObjective` calcula, tras histéresis, el "runner-up" (mejor rival entre los `significant`) y corre un `twoProportionZTest` entre el pick final y ese rival — **siempre sobre return rate**, incluso con objective económico. Devuelve `clearWinner`/`runnerUpVariantId` sin colapsar `variantId` a null — el preview sigue mostrando el pick tentativo. `checkOptimizationEligibility` agrega `OPTIMIZATION_AMBIGUOUS_WINNER`, gateado solo por `requireAutomaticMode`.

## Statistical rule

Un test adicional (best vs. runner-up), no plegado en la familia Holm-Bonferroni existente — pregunta distinta, umbral propio no ajustado α=0.05, decisión documentada explícitamente en el código.

## Economic rule

Si el objective es económico, el runner-up también se elige por valor económico, pero el test estadístico sigue siendo sobre return rate — un ganador económico sin ventaja de return rate estadísticamente distinguible queda `clearWinner: false`.

## Assisted behavior

Sin cambios — preview/manual-apply nunca gateados por `clearWinner`.

## Automatic behavior

`runAutomatic` rechaza con `OPTIMIZATION_AMBIGUOUS_WINNER` cuando `clearWinner:false`. Confirmado con test unitario y empíricamente: `automaticAppliedRate: 16.7%` en NEAR_TIE vs. `33.3%` en STRONG_SIGNAL.

---

## Ajuste: separar ganador por retorno vs. ganador económico

**Problema del informe anterior**: un solo `winnerAccuracy` compara el ground truth de RETORNO contra lo que Flikker detectó, sin importar si Flikker detectó por retorno o por economía. Eso hace que un "INCORRECT" sea ambiguo: ¿Flikker se equivocó, o contestó bien una pregunta económica distinta a la de retorno?

**Qué se agregó** (todo en `SimulationResult`, aditivo — los campos viejos `trueWinner`/`detectedWinner`/`winnerAccuracy` se mantienen para compatibilidad):

- `returnWinner` / `detectedReturnWinner` / `returnWinnerAccuracy` — ground truth de retorno vs. lo que Flikker habría dicho si **solo** mirara return rate (`determineWinnerByReturnRate`, nueva función pura, nunca mira economía).
- `economicWinner` / `detectedEconomicWinner` / `economicWinnerAccuracy` — nuevo **ground truth económico** (`computeEconomicGroundTruth`): valor neto esperado por cliente = retorno-verdadero × ticket × margen, menos costo esperado de redención (solo para SOFT_BENEFIT/STRONG_BENEFIT; REMINDER/PROGRESS_REMINDER siempre cuestan 0) — calculado con los mismos parámetros reales del escenario (ticket, margen, `rewardRedemptionRate`, el incentivo real que carga SOFT_BENEFIT), nunca con nada que Flikker haya observado. Comparado contra `determineWinnerByEconomics` (nueva función pura — nunca cae a return rate, y da `NO_CONCLUSION` si algún candidato comparable no tiene economía conocida, en vez de adivinar).
- `optimizationObjectiveUsed: 'RETURN' | 'ECONOMIC' | null` — qué lente usó realmente la detección real de Flikker este round.

No se tocó `determineWinner` (la función real del dashboard, Fase D) — las dos funciones nuevas viven al lado, duplicando sus mismos gates de NO_CONCLUSION a propósito, para no arriesgar el comportamiento ya shippeado.

Verificado con 10 tests nuevos (funciones puras) + 1 test de integración que reproduce el caso exacto de Fase D §23 (discount-20 gana por retorno, upgrade gana por economía) separado en las dos preguntas, más 6 corridas reales.

---

## Strong-signal, revisado con las métricas separadas

Re-corrida completa (6 seeds, 1000 clientes/90 días, AUTOMATIC) con las nuevas métricas.

**Resultado por RETORNO:**
```
returnWinnerCorrectRate:   100% (6/6 seeds)
```
Flikker identifica correctamente a SOFT_BENEFIT como el de mejor return rate, **siempre**, en las 6 corridas.

**Resultado por ECONOMÍA:**
```
economicWinnerCorrectRate: 0% (0/6 seeds)
optimizationObjectiveUsed: ECONOMIC en las 6/6 (Flikker siempre tuvo economía completa disponible y la usó)
economicWinner (ground truth):    SOFT_BENEFIT, en las 6/6
detectedEconomicWinner (Flikker): REMINDER, en las 6/6
```

**Conclusión — esto NO era Flikker eligiendo correctamente por valor económico.** El ground truth económico real (calculado con los parámetros reales del escenario, nunca con nada observado) también favorece a SOFT_BENEFIT — por el mismo motivo que el retorno: el gap de ~11pp es tan grande que ni con el costo real de la promoción restado, SOFT_BENEFIT deja de ser la mejor opción en términos de plata. Flikker se equivocó en **ambas** lecturas al mismo tiempo cuando se mide contra el ground truth correcto de cada una — no es que estuviera "bien pero contestando otra pregunta".

**Por qué se equivoca específicamente en la lectura económica y no en la de retorno**: `estimationErrorPercent` en estas corridas es 96-152% — el mismo ruido de estimación ya documentado en escenarios anteriores. Ese ruido afecta a SOFT_BENEFIT de forma más dañina que a REMINDER: REMINDER no tiene costo, así que una subestimación de su uplift solo lo hace ver "menos bueno", nunca negativo. SOFT_BENEFIT sí paga un costo real (~UYU 7,000-9,300 según el seed) — una subestimación de SU uplift real se resta contra un costo que SÍ es real, así que el ruido puede hacer que su valor neto ESTIMADO caiga por debajo del de REMINDER aunque el valor neto VERDADERO de SOFT_BENEFIT siga siendo mayor. Esto es un hallazgo real y específico: **las variantes con costo real son estructuralmente más vulnerables a que el ruido de estimación invierta el ganador detectado, incluso cuando la economía verdadera no se invierte** — un Algorithm Concern genuino, no algo para "arreglar" tocando el algoritmo real ni el ground truth (instrucción explícita respetada: no se cambió nada del motor de optimización ni de la construcción del escenario para mejorar este número).

`clearWinnerRate: 83.3%` (5/6) — el propio gate de "ganador claro" (Parte B) quedó **confiado** en el pick equivocado la mayoría de las veces. Esto es esperable y no es una falla del gate: el gate mide si la ventaja del pick sobre su rival es estadísticamente real (lo es — REMINDER de verdad le ganó a SOFT_BENEFIT en los datos OBSERVADOS de esa corrida), no si el pick coincide con el ground truth. El gate protege contra ruido de MUESTRA CHICA/empate, no contra un error sistemático de estimación con muestra grande — son dos problemas distintos y este hallazgo señala el segundo, que queda fuera del alcance del gate según fue diseñado.

`automaticAppliedRate: 33.3%` (2/6) — de los 5 seeds con `clearWinner:true`, solo 2 llegaron a aplicar (otros gates —presupuesto, cooldown— bloquearon el resto).

---

## Bugs encontrados — atribución correcta

**Bug #1 — REAL, en producción, no en el arnés.** `RetentionV2SendService.processAssignment` (código real que corre en cada envío real de Flikker) tenía el problema de segmento descrito arriba en "Causal validity". Si `REWARD_GOAL_PROGRESS` se hubiera lanzado sin este arreglo, **cualquier negocio real usándolo habría visto el 100% de sus PROGRESS_REMINDER silenciosamente descartados** en el momento del envío. Esto se encontró y arregló ANTES de que se ejecutara ninguna corrida reportada en este documento — ninguno de los números de arriba refleja el bug, todos ya incluyen el fix.

**Bug #2 — del arnés de Simulation Center, nunca afectó producción.** `EXPLORATION_FLOOR_RESPECTED` (invariante del simulador, `simulation-invariants.service.ts`) fallaba siempre en un experimento de 2 brazos por construcción matemática (`sum(nonControl) - largest = 0` con un solo challenger). Este archivo no es código de producción — solo lo usa Simulation Center para verificar sus propias corridas.

**Bug #3 — también del arnés, nunca afectó producción.** `computeGroundTruth`/`winnerAccuracy` (`simulation-ground-truth.ts`, `simulation-results.service.ts`) consideraba los 3 códigos tratables sin importar cuáles estaban realmente en el experimento — un two-arm siempre reportaba `INCORRECT`. Estos archivos tampoco son código de producción — solo calculan el "answer key" contra el que Simulation Center compara sus propias corridas.

**Resumen honesto**: de los 3 bugs de esta tanda, **1 era real y hubiera afectado un negocio en producción** (encontrado y arreglado antes de reportar nada); **2 eran exclusivamente del arnés de pruebas** y nunca podrían haber tocado un `Business` real.

---

## Tests

- `retention-v2`: 420/420 (incluye integración real DB para REWARD_GOAL_PROGRESS y regresión del bug de send-time).
- `simulation`: 200+ (incluye ground truth económico, clear-winner gate, exploration floor de 2 brazos).
- 11 tests nuevos para la separación retorno/economía (funciones puras + 1 integración que reproduce el ejemplo exacto de Fase D §23 separado en ambas preguntas).
- Regresión completa de la app en cada tanda: misma línea base de 6 suites/59 tests preexistentes y no relacionados — cero regresión introducida en ningún punto.

## Near-tie results

Ground truth con gap ≈0.74pp entre REMINDER y SOFT_BENEFIT (aritmética verificada por test, construida antes de correr nada). 6 seeds, 1000/90, AUTOMATIC: `automaticAppliedRate: 16.7%` (1/6) — AUTOMATIC se abstiene correctamente en un empate real. `safetyFailureRate: 0%`.

## Remaining risks

- No se repitieron A/B/C a escala 1000/90 (decisión explícita de priorización de tiempo).
- El Algorithm Concern de STRONG_SIGNAL (variantes con costo son más vulnerables a que el ruido invierta el ganador económico detectado) es real y merece atención de producto — posiblemente reduciendo el ruido de estimación de costo/redención antes de confiar en `optimizationObjectiveUsed: ECONOMIC` para decisiones automáticas sin supervisión.
- El Bug #1 (real, de producción) ya está arreglado y verificado, pero subraya que cualquier objective/feature nueva necesita este mismo nivel de verificación end-to-end antes de un piloto, no solo tests unitarios.

## Pilot recommendation

Ver conclusión final abajo.

---

## Respuestas explícitas

1. **¿PROGRESS_REMINDER ahora compara la misma población en CONTROL y treatment?** Sí — estructural y empíricamente verificado.
2. **¿Puede existir un PROGRESS assignment sin active goal?** No para `REWARD_GOAL_PROGRESS`. Para el objective histórico `AT_RISK_RECOVERY` (backward-compat) sigue siendo posible por diseño, protegido igual que siempre por `sendProgressReminder`.
3. **¿AUTOMATIC se abstiene cuando dos challengers están empatados?** Sí — 16.7% en NEAR_TIE vs. 33.3% en STRONG_SIGNAL.
4. **¿Qué correctWinnerRate obtuvimos en two-arm?** 100% en los tres escenarios two-arm (6 seeds c/u), vs. 10% en el baseline de 4 brazos.
5. **¿Qué pasa con 1000 clientes/90 días?** Usado en NEAR_TIE y STRONG_SIGNAL por spec; no repetido en A-C (decisión de tiempo).
6. **¿El strong-signal se detecta consistentemente?** Por retorno sí (100%). Por economía no (0%) — ver conclusión.
7. **¿Sigue siendo recomendable ASSISTED para el primer piloto?** Sí — ver conclusión.

---

## Resultado final pedido

**STRONG_SIGNAL por retorno**: `returnWinnerCorrectRate = 100%` (6/6 seeds). Flikker identifica a SOFT_BENEFIT como el de mejor retorno de forma perfectamente consistente cuando el gap de ground truth es grande.

**STRONG_SIGNAL por economía**: `economicWinnerCorrectRate = 0%` (6/6 seeds falló). El ground truth económico real **también** favorece a SOFT_BENEFIT — no es una pregunta distinta con una respuesta distinta válida. Flikker detectó a REMINDER como ganador económico en las 6 corridas, equivocándose las 6 veces, con `optimizationObjectiveUsed: ECONOMIC` siempre.

**Conclusión**: el 33.3% original no era Flikker eligiendo correctamente por valor económico — era un error real de estimación económica, distinto del error de estimación de retorno (que en este escenario fue perfecto). Las variantes con costo real (SOFT_BENEFIT) son más vulnerables a que el ruido de estimación invierta el ganador económico detectado que las variantes sin costo (REMINDER), porque el ruido en la variante gratuita nunca se ve agravado por un costo real restándose encima. Esto es un Algorithm Concern genuino sobre la confiabilidad de la estimación económica con esta muestra/duración — no un bug de esta tanda, y no algo que se haya tocado en el algoritmo real ni en el ground truth para mejorar el número.

**¿Seguimos recomendando ASSISTED para el primer piloto?** Sí, más reforzado que antes. La separación retorno/economía muestra que Flikker puede tener una lectura de RETORNO perfecta mientras su lectura ECONÓMICA se equivoca sistemáticamente en el mismo escenario — exactamente el tipo de discrepancia silenciosa que un humano revisando antes de aplicar (ASSISTED) atrapa, y que `AUTOMATIC` sin supervisión no. El clear-winner gate (Parte B) ayuda con empates de muestra chica, pero este hallazgo confirma que no protege contra un error sistemático de estimación de costo con muestra grande — una razón más, no menos, para mantener revisión humana en el piloto inicial antes de confiar `optimizationMode: AUTOMATIC` sin supervisión, especialmente en experimentos con variantes que cargan costo real.
