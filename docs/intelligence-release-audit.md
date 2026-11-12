# Flikker Intelligence: auditoría de release

Estado al 2026-11-11. Todo lo de abajo se verificó en código y con tests
contra Postgres local. No se consultó producción y no se hizo ningún deploy.

## 1. Requisitos contra implementación

| Requisito | Estado | Evidencia |
|---|---|---|
| Chat persistente con título editable | ✅ | Prompts 1–2. `conversations.service`; tests de conversaciones (renombrar, archivar, borrar, aislamiento por usuario). |
| Multi-turn | ✅ | `recentForAgent` manda el historial reciente; hay un test de seguimiento ("recuerda la conversación"). |
| Streaming | ✅ | SSE (`agent.service`); test HTTP + SSE. |
| Análisis real | ✅ | Herramientas de solo lectura con datos del negocio de la sesión. El *grounding* rechaza números que no vienen de una herramienta. |
| Reportes y exports | ✅ | Prompt 4: reportes determinísticos y exportación CSV/PDF, solo dueño o admin. |
| Herramientas ejecutoras | ✅ | Prompt 5: borradores (modo A) y propuestas (modo B). La IA nunca escribe en la base: lo hacen los servicios de dominio. |
| Modo B: pedido explícito + confirmación | ✅ | Confirmación por endpoint autenticado con `planHash` y verificación de la versión de los datos. Hay tests de doble click, concurrencia, cambio de datos y vencimiento. |
| Modo A proactivo bajo política | ✅ | Prompt 7: modo autónomo, apagado por defecto. Primero simulación; el piloto lo activa Platform Admin con confirmación explícita. |
| Activity Log | ✅ | "Actividad autónoma" y AuditLog (`INTELLIGENCE_ACTION_*`, `POLICY_*`, `AUTONOMY_*`). |
| Costo | ✅ | `AiUsageEvent` por turno, presupuestos del motor y reporte de costos para Platform (sección 3). |
| Consentimiento | ✅ | Prompt 6: registro por canal; no darse de baja no cuenta como autorización. |

## 2. Revisión técnica

**Estados:** ✅ ok · 🔧 corregido en esta tanda · ⚠️ pendiente (en la sección 4).

| Tema | Estado | Detalle |
|---|---|---|
| Aislamiento por tenant | ✅ | Todo controller de Intelligence, del motor de políticas y del modo autónomo usa `TenantGuard`, y las queries filtran por `businessId`. Hay tests de acceso cruzado (404) en conversaciones, acciones, reportes, consentimiento y modo autónomo. |
| Roles | ✅ | Escribir requiere dueño o admin. Aceptar, editar o reanudar la política es solo del dueño. El piloto es solo de Platform Admin. Hay tests de 403 por rol. |
| Inyección de prompt | ✅ | Los comentarios de clientes viajan como `customerTextUntrusted`, y los que tienen forma de instrucción se omiten. Esos textos nunca respaldan números ni acciones, y el modo B exige un pedido explícito y confirmación. |
| Datos personales que van a OpenAI | 🔧 | Las herramientas ya no mandaban nombres, teléfonos ni emails de clientes. **Corregido ahora:** un cliente puede escribir su teléfono o email dentro de un comentario; ahora se reemplazan por `[teléfono]` y `[email]` antes de salir (`customer-text.ts` + test). |
| Logs sin secretos | ✅ | El proveedor loguea modelo, latencia y tokens; nunca el prompt, el contenido ni la key. Los errores no incluyen headers. |
| Límites de tokens y herramientas | ✅ | 4 rondas por turno, 1.200 tokens de salida por ronda, 60 turnos por día por negocio (`AI_MAX_DAILY_INTELLIGENCE_TURNS`), y cortes en la salida de cada herramienta. |
| Timeout y reintentos | ✅ | Timeout por turno. Un error deja el turno como reintentable, sin respuesta a medias (test). OpenAI no se reintenta solo: reintenta el usuario. |
| Streaming interrumpido | ✅ | Guarda lo verificable o deja constancia (test "interrupción"). |
| Operaciones idempotentes | ✅ | Acciones (clave de idempotencia), reservas del motor (clave única), promociones (clave por intento) y corridas autónomas (una por negocio y día). |
| Permisos de confirmación | ✅ | Solo quien la pidió, solo en el negocio activo, con el plan exacto. Si el plan cambió, la aprobación caduca. |
| Tests de frontend en CI | 🔧 | **Corregido:** CI no corría tests de web. Se agregó el paso `Run tests (web)`, y se arregló un test viejo de `toast` que apuntaba a una función que ya no existe. Hoy: 667/667. |
| Migraciones no destructivas | 🔧 | Las 5 migraciones nuevas son aditivas (sin DROP ni ALTER COLUMN). **Corregido:** el replay completo desde cero fallaba en `20260813120000_message_templates_business_fk` (P3018), así que el paso "Run migrations" de CI cortaba antes de los tests de API. Ahora es idempotente; replay completo verificado y sin drift contra `schema.prisma`. |
| Colas | ✅ / ⚠️ | El modo autónomo corre dentro del job de Autopilot (BullMQ). Sin Redis no corren ni Autopilot ni el modo autónomo. Hay tests de cola caída, doble cron y reintento. Se corrigió además el bug de asignaciones fuera de horario que nunca salían (Prompt 7). |
| Plantillas y ventanas de WhatsApp | ⚠️ | El proveedor actual (WHAPI/WaSender) manda texto plano: no hay plantillas aprobadas, ventana de 24 h ni precio informado. Se controla con consentimiento, horario, frecuencia y un costo por mensaje cargado a mano. |
| Controles de gasto | ✅ | IA: tope diario de turnos. Mensajería e incentivos: bolsas mensuales del motor, con reserva atómica, 25 % por campaña y kill switch. |
| Rate limiting HTTP de Intelligence | ⚠️ | `ThrottlerGuard` solo cubre `auth`. El costo ya está acotado por el tope diario, pero no hay límite por minuto. |
| Candado por conversación | ⚠️ | Vive en memoria de cada instancia: con varias réplicas, dos turnos simultáneos en la misma conversación serían posibles. |

**Tests que se arreglaron en esta tanda:** el caso "id inexistente" de acciones fallaba 1 de cada 16 veces. Armaba el id cambiando el último carácter por `0`, y a veces era el mismo id. Ahora usa un UUID nuevo.

## 3. Costo aproximado

### Fuente

Reporte nuevo `GET /platform/intelligence/costs?from=AAAA-MM-DD&to=AAAA-MM-DD[&businessId=]`
(solo Platform Admin). Separa tres bolsas que nunca se suman, porque son monedas distintas:

- **IA (USD):** sale de `AiUsageEvent` y se recalcula con los precios configurados (`AI_PRICE_INPUT_PER_MILLION_USD`, `AI_PRICE_OUTPUT_PER_MILLION_USD`). Da costo por turno y por conversación.
- **Mensajería (moneda del negocio):** mensajes de marketing enviados × costo por mensaje. Si no hay costo cargado, el resultado es "desconocido", no cero.
- **Recompensas (moneda del negocio):** emisiones de promociones y de Autopilot. Separa lo canjeado y la responsabilidad máxima, y cuenta aparte las emisiones sin costo estimable.

### Medición real disponible: demo local, no clientes

Base local, 2026-11-01 a 2026-11-11, modelo `gpt-4o-mini`, US$ 0,15 / 0,60 por millón de tokens:

| Métrica | Valor |
|---|---|
| Turnos del agente | 36 (0 fallidos) |
| Tokens | 166.229 de entrada, 4.713 de salida (unos 4.600 y 130 por turno) |
| Costo por turno | **US$ 0,00077** |
| Total | US$ 0,028 |

Son las conversaciones de prueba de los Prompts 3 a 7. Sirven para dimensionar, no son uso de clientes. El conteo por conversación (1) no es representativo: las demos usaron conversaciones que después se borraron o quedaron fuera del rango.

### Escenarios por negocio y mes

Con el costo por turno medido. Son supuestos, no resultados:

| Uso | Turnos por mes | IA por mes |
|---|---|---|
| Liviano (2 consultas por día hábil) | ~50 | ~US$ 0,04 |
| Activo (10 por día) | ~300 | ~US$ 0,23 |
| Tope diario agotado todos los días (60/día) | 1.800 | ~US$ 1,40 con el consumo medido |
| Peor caso teórico (60/día, 4 rondas, ~20 k tokens de entrada) | 1.800 | ~US$ 27 |

La mensajería y las recompensas no dependen de la IA. Las acotan las bolsas de la política de cada negocio. El preset propone UYU 500 de mensajería por mes; el presupuesto de incentivos no tiene propuesta, lo define el dueño, y sin él no se compromete ningún premio con costo (política v2). Hoy no hay telemetría real de mensajería ni de recompensas de Intelligence porque nada salió todavía.

## 4. Lista verificable para habilitar producción

Cada ítem dice cómo se verifica. Nada de esto está hecho en producción.

### A. Código y CI
- [ ] **A1. Commits y PRs:** Prompts 1–8 están sin commitear. Separarlos en PRs chicos (conversaciones y chat · agente · reportes · acciones · motor de políticas · modo autónomo · cierre). *Verificar:* PRs mergeados a `main`.
- [ ] **A2. CI en verde de punta a punta.** Quedan dos fallas ajenas a Intelligence:
  - `google-calendar-parser.spec`: bug real del parser (`"María García 8"`);
  - `subscription-capabilities.integration.spec`: necesita los planes `pro` y `pro-selfservice`, que salen de un seed que CI no corre.

  *Verificar:* el último run de CI en `main`, con todos los pasos verdes.
- [ ] **A2b. Specs intermitentes de Retention V2** (`retention-v2-self-service-e2e`, `retention-v2-reward-goal-progress`). `runDaily` recorre todos los negocios de la base, así que specs en paralelo se pisan los datos. Opciones: correrlos en serie o acotar el barrido por negocio en los tests. *Verificar:* 5 corridas seguidas sin fallas.
- [ ] **A3. Lint de web en CI:** primero corregir los 6 errores existentes, en archivos legacy fuera de Intelligence, y después agregar el paso. *Verificar:* `npm run lint --workspace=apps/web` sale con 0.

### B. Base de datos (cada paso con aprobación)
- [ ] **B1. Backup de producción** antes de migrar. *Verificar:* backup restaurable con fecha.
- [ ] **B2. Estado de `20260813120000_message_templates_business_fk` en producción.** Se modificó su SQL para hacerla idempotente. Con permiso, solo lectura:
  `SELECT migration_name, finished_at FROM _prisma_migrations WHERE migration_name = '20260813120000_message_templates_business_fk';`
  - Si no está aplicada: se aplica normal y crea la FK.
  - Si ya está aplicada: confirmar en staging que `prisma migrate deploy` no frena por el checksum distinto, antes de producción.
- [ ] **B3. Migraciones nuevas aplicadas** primero en staging (o una copia) y después en producción, con `npm run start:release`: `20261109090000_intelligence_conversations`, `20261110090000_intelligence_reports`, `20261111090000_intelligence_actions`, `20261112090000_policy_engine`, `20261113090000_intelligence_autonomy` y `20261118090000_policy_adaptive_limits`. *Verificar:* `npx prisma migrate status` sin pendientes.

### C. Configuración
- [ ] **C1. Variables:** `OPENAI_API_KEY`, `AI_MODEL`, `AI_PRICE_INPUT_PER_MILLION_USD`, `AI_PRICE_OUTPUT_PER_MILLION_USD`, `AI_MAX_DAILY_INTELLIGENCE_TURNS` y `REDIS_URL`. **Sin Redis no corren Autopilot ni el modo autónomo.** *Verificar:* en el log de arranque, la cola `retention-v2` registrada.
- [ ] **C2. `RETENTION_V2_EVALUATE_CRON` con horario confirmado.** Con el arreglo del Prompt 7, lo que cae fuera de la ventana se reintenta cada 30 minutos. *Verificar:* `retention_decision_logs` muestra `MESSAGE_SENT` dentro de la ventana en staging.
- [ ] **C3. Intelligence habilitado por negocio** (`RetentionSettings.aiInsightsEnabled`), solo para el negocio piloto.

### D. Negocio piloto
- [ ] **D1.** Seguir `docs/intelligence-pilot-plan.md`, punto por punto.

### E. Riesgos aceptados para el piloto (firmar explícitamente)
- [ ] **E1.** WhatsApp sin plantillas oficiales ni ventana de 24 h (proveedor actual).
- [ ] **E2.** Sin rate limiting por minuto en Intelligence; el costo lo acota el tope diario.
- [ ] **E3.** Candado por conversación en memoria (usar una sola réplica durante el piloto).
- [ ] **E4.** "Beneficio por vencer" y "Cohorte con descenso" se detectan, pero no se ejecutan.
- [ ] **E5.** No hay un job que purgue conversaciones borradas: quedan marcadas, no eliminadas.
