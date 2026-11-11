# Flikker Intelligence — prompts de desarrollo para Claude Code

**Versión:** 1.0 · **Fecha:** 9 de noviembre de 2026

**Cómo usar:** abrí Claude Code en la raíz del repositorio de Flikker. Pegá el **Prompt 0** y, una vez que su diagnóstico esté revisado, ejecutá **un prompt por vez**. No pegues los nueve juntos. Después de cada entrega, revisá los archivos cambiados, probá el flujo y pedí correcciones antes de pasar al siguiente. Si alguno de los hallazgos de la auditoría no coincide con el repo actual, **manda el código actual**.

## Contrato de producto — aplicar a todas las entregas

- **Sin rediseño:** no rediseñar Flikker Core, el panel actual, la tarjeta de sellos ni la experiencia de Mi Flikker. Crear únicamente una nueva sección **Intelligence** respetando componentes, estilos, navegación y permisos existentes.
- **Modo A — marketing y retención:** agente proactivo que detecta oportunidades, analiza, prepara y, cuando existe autorización del comercio y controles operativos completos, programa y ejecuta campañas **sin aprobar cada una**. Usa el motor de Retention V2/Autopilot existente, nunca otro motor de mensajería paralelo.
- **Modo B — administración:** el usuario puede pedir cambios a sellos, beneficios, misiones, campañas y configuraciones. Leer y proponer es libre; cambios con impacto requieren confirmación explícita e inequívoca; eliminar datos, cambiar facturación, exportar PII a gran escala queda fuera de V1.
- **Equilibrado (presets PROPUESTOS, editables):** mensajería 500 UYU/mes; responsabilidad económica estimada de incentivos 1.500 UYU/mes; máximo 25 destinatarios únicos/semana; máximo 2 campañas nuevas/semana; no más de una promoción por persona cada 14 días ni dos cada 30; horario 10–20 hora del comercio; tope por campaña equivalente a 25% de la suma de ambos presupuestos, **sin superar los límites individuales de cada bolsa**. Cada comercio debe **autorizar explícitamente estos límites antes del primer envío automático**; sin política activada, solo análisis/borradores. No activar automáticamente políticas para comercios existentes.
- **Incentivos:** priorizar mensajes útiles sin descuentos, recordatorios de progreso/beneficios ya obtenidos y segunda visita. Solo elegir incentivos de un catálogo previamente autorizado; no crear regalos, descuentos, deuda económica ni cambiar reglas generales automáticamente. Reservar el costo máximo potencial antes de ofrecer una recompensa (no solo el costo de los canjes ya efectuados), liberar/reconciliar al caducar/canjear.
- **Seguridad innegociable:** datos siempre filtrados por `businessId` y rol efectivo, con enforcement servidor; consentimiento granular por canal y revocación; registros de decisiones, aprobaciones y resultados; reintentos idempotentes, control de concurrencia, kill switch, dry run, límites de gasto, frecuencia y horarios. Nunca ejecutar envíos de prueba en producción.
- **Veracidad:** métricas y números solo desde herramientas deterministas. Distinguir visitas observadas, reactivaciones atribuidas e incrementalidad experimental. Si no hay ventas conectadas, no hablar de ROI de ventas realizado.
- **Stack auditado (verificar primero):** monorepo `apps/api` NestJS + Prisma/PostgreSQL + BullMQ/Redis; `apps/web` Next.js App Router + Tailwind. Existen `OpenAiProviderService`, `AiConfigService`, `AiGateService`, `AiUsageService`, chatbot solo lectura con seis herramientas, `retention-v2` y servicios de WhatsApp saliente. Hay LEGACY y CHECKIN_V2 paralelos. NO recrear ninguno sin justificarlo.
- **Método de entrega:** PRs pequeños; no reemplazar stack ni migrar de forma destructiva; tests + typecheck + lint. Informar archivos cambiados, migraciones, riesgos y cómo probar manualmente. No ejecutar migraciones en producción ni activar envíos externos sin autorización humana.

---

## Prompt 0 — Diagnóstico del código real (sin modificar nada)

```text
Actuá como tech lead y arquitecto de Flikker. Quiero construir Flikker Intelligence como agente ejecutor, con chat real, historial, reportes y autonomía equilibrada, PERO primero inspeccioná el repositorio actual. NO modifiques archivos en este paso.

Objetivos del producto:
- Sección nueva Intelligence, sin rediseñar el resto.
- Modo A: marketing/retención autónoma dentro de límites previamente autorizados por cada comercio.
- Modo B: administración por conversación, cambios relevantes solo con confirmación.
- Reutilizar OpenAiProviderService, AiGateService, AiUsageService, chatbot de solo lectura, Retention V2, WhatsAppBspService y servicios de dominio si realmente existen.

Revisá: rutas de apps/web, menú, módulos ai/retention-v2, OpenAI SDK instalado y su API, JWT/cookies, TenantGuard/RolesGuard, Prisma schema, CustomerEvent, permisos, consentimiento, colas BullMQ, dry-run, jobs, tests y logs. Identificá la diferencia entre lo que está implementado, activado, usable y realmente probado.

Caso crítico: un negocio tiene aproximadamente 105 clientes registrados y Autopilot no ha generado acciones observables. No supongas la causa. Buscá dónde se calculan elegibilidad, restricciones, pausas, envío y estados. Si no hay acceso autorizado a datos de producción, NO intentes acceder ni inventes cifras: proponé consultas READ-ONLY y un diagnóstico que se pueda ejecutar de forma segura.

Entregame: (1) mapa de archivos reales; (2) capacidades reutilizables; (3) bloqueos para enviar automáticamente; (4) plan de 8 PRs pequeños y ordenados; (5) cambios mínimos en schema; (6) riesgos por multi-tenancy y consentimiento; (7) tests existentes y faltantes. Marcá cada afirmación como confirmada o hipótesis. NO escribas código todavía.
```

**Salida para aceptar:** informe basado en archivos concretos, sin cambios, con explicación de cómo inspeccionar el caso de los 105 clientes sin poner datos reales en peligro.

---

## Prompt 1 — Backend de conversaciones persistentes

```text
Implementemos SOLO la base de conversaciones de Flikker Intelligence. No hagas todavía llamadas nuevas a OpenAI ni toques Autopilot.

Usá la arquitectura NestJS/Prisma actual y la autenticación existente. Modelá conversaciones y mensajes con businessId, creador/propietario, título, título manual/automático, estados, timestamps, rol, tipo de mensaje (user, assistant, tool/action), metadata validada y relación con acciones cuando exista. Migración ADITIVA, sin alterar tablas legacy.

API segura para: crear chat, listar con paginación y búsqueda, obtener mensajes paginados, renombrar, archivar y eliminar lógicamente una conversación propia. Si otros roles pueden acceder, documentá y aplicá explícitamente la política. Evitá cualquier lectura cruzada entre businesses o usuarios; no confíes en IDs proporcionados por el frontend. Validá límites de longitud y payload.

Usá TenantGuard/RolesGuard donde corresponda y revisá el riesgo actual de guard opt-in. No hagas una migración global de guards en este PR, pero garantizá seguridad real en los nuevos endpoints. Definí retención de datos y tratamiento de PII en el diseño.

Entregá código, migración, DTOs/validación, tests de integración con Postgres para aislamiento multi-tenant, permisos y paginación, y comandos de ejecución. No incluir datos inventados ni cambios al dashboard.
```

**Salida para aceptar:** chats reales persistidos y correctamente aislados; tests verdes.

---

## Prompt 2 — Interfaz de chat, sin rediseñar Flikker

```text
Construí SOLO la nueva sección visual Flikker Intelligence encima de los endpoints de conversaciones existentes. NO rediseñes el panel, Core, Pass ni Mi Flikker. Reutilizá componentes, tokens, layouts y patrones del repo.

Necesito: ítem de menú Intelligence; pantalla de chat responsive; botón Nuevo chat; sidebar/selector de conversaciones con búsqueda; renombrar título, archivar y eliminar con confirmación; scroll, estados de carga, errores y vacío; textarea multilínea (Enter envía, Shift+Enter salto); interrumpir generación cuando luego exista streaming; reintentar errores; fecha/título del chat; estados visuales para herramientas, reportes y acciones; mobile usable.

Esta pantalla debe funcionar primero contra API real de conversaciones. Si todavía no hay respuestas de IA, usar un estado vacío explícito, NO respuestas mock en producción ni métricas falsas. Agregá tests frontend de interacción adecuados para el stack y hacé que CI pueda ejecutarlos o documentá el cambio mínimo pendiente.

Quiero screenshots o descripción de recorrido manual, archivos tocados, pruebas y checklist de aceptación. No implementar agente ni envíos en este PR.
```

**Salida para aceptar:** sección integrada, chats navegables y operables, sin rediseño lateral del producto.

---

## Prompt 3 — Agente conversacional real + herramientas de solo lectura

```text
Convertí la sección Intelligence en un agente de conversación real, usando la API de OpenAI YA configurada en Flikker, sin duplicar provider, facturación de tokens, kill switch ni cuotas. Inspeccioná SDK y docs vigentes: preferí Responses API para integración nueva si el SDK actual lo soporta; si migrar rompe servicios existentes, encapsulá compatibilidad sin tocar flujos legacy.

Implementá orquestación multi-turn con function/tool calling: el modelo decide cuáles herramientas usar según la pregunta, el servidor valida argumentos, permisos y businessId, ejecuta consultas deterministas y le devuelve los resultados; el modelo interpreta y explica. Herramientas de solo lectura iniciales: resumen de negocio, evolución de visitas, segmentos, canjes, campañas, retención, configuración de Autopilot y razones de ineligibilidad. Reutilizá las seis herramientas existentes antes de crear otras. Sin SQL libre del LLM y sin acceso directo del modelo a secretos o toda la base.

Debe responder naturalmente, sin lista fija de respuestas. Memoria contextual por conversación; historial con truncado/resumen seguro; streaming real (SSE u otro transporte compatible), interrupción, timeout, límites de turnos/herramientas/tokens, errores recuperables y costos por negocio. Guardá mensajes y resultados verificables. Mantener validators de grounding y endurecerlos sin confiar solo en regex. El agente no debe afirmar que ejecutó acciones todavía.

Probá: preguntas con seguimientos, comparaciones reales, dataset vacío, falta de permiso, inyección de instrucciones desde feedback de cliente, numbers grounded y fallas de OpenAI. Entregá tests y demo de uso.
```

**Salida para aceptar:** chat no prefabricado, respuestas basadas en datos correctos del comercio y cero accesos cruzados.

---

## Prompt 4 — Reportes reales y análisis profundos

```text
Agregá a Flikker Intelligence capacidades de reportes y análisis sin habilitar acciones de escritura aún.

Quiero pedidos como: 'analizá por qué bajó la recurrencia', 'compará octubre con septiembre', '¿qué pasó con los 105 clientes registrados?', 'armá un informe mensual'. El backend debe calcular periodos, denominadores, cohortes, nuevos/recurrentes/inactivos, visitas y canjes mediante queries deterministas; el LLM solo interpreta y propone hipótesis. Si no hay datos suficientes o no existe compra/POS, decilo expresamente. Nunca llamar ROI a un dato de check-ins.

Mostrar en el chat tablas y gráficos con datos reales, supuestos y rango temporal; exportar a PDF/CSV cuando los permisos y la herramienta de exportación lo permitan. Cada reporte necesita businessId, creador, fechas, fuentes, fecha de cálculo y métricas trazables. No inventar vistas ni valores. Respetar privacidad de clientes y permisos de exportación. Reutilizar servicios analytics/insights existentes.

Entregar al menos tests con dataset controlado que comprueben que cada número coincide con DB, y pruebas de acceso. No tocar otros módulos más allá de contratos necesarios.
```

**Salida para aceptar:** reportes reproducibles y verificables, exportación segura y recomendaciones útiles.

---

## Prompt 5 — Herramientas ejecutoras, borradores y confirmación (Modo B)

```text
Ahora agregá herramientas de escritura al agente, pero SOLO en modo seguro: crear segmentos, crear/editar borradores de campaña, preparar una recompensa, programar una campaña autorizada, pausar una campaña, y bajo solicitud explícita del usuario proponer cambios a reglas de sellos, beneficios, misiones y configuraciones compatibles con el código actual.

Usá comandos/servicios de dominio existentes: jamás dejes que OpenAI escriba Prisma/SQL directamente. Cada operación tiene schema estricto, verificación RBAC y tenant en backend, validación de negocio, cálculo de impacto, audit log e idempotency key. Separá create_draft de commit/execute.

Para acciones de impacto (costo, comunicaciones, cambio de programa): presentá una tarjeta con resumen de antes/después, destinatarios, fecha, canal, costo máximo, riesgos y botón Confirmar/Cancelar. La confirmación es un evento de backend autenticado asociado al plan exacto y versión de los datos; no sirve un 'sí' ambiguo del texto. Si cambia el plan, caduca la aprobación. No autorizar B de forma proactiva; B solo responde a pedidos explícitos. A puede preparar borradores sin confirmación.

En esta entrega NO habilites envío real de WhatsApp ni incremento de presupuestos desde el agente. Implementá sandbox/dry-run y tests de autorización, doble click, reintento, concurrencia, cambio de tenant y acción rechazada.
```

**Salida para aceptar:** agente capaz de preparar y confirmar cambios autorizados, sin efectos económicos externos todavía.

---

## Prompt 6 — Motor de políticas: consentimiento, costos y límites

```text
Implementá un Policy & Budget Engine reutilizable por Intelligence y Retention V2. Antes de modificar nada, inspeccioná RetentionSettings, consentimientos, presupuestos y códigos de WhatsApp actuales. No agregues una segunda fuente de verdad donde pueda reutilizarse la existente.

Necesito configuración por negocio, aceptación explícita de política y un kill switch visible. Preset Equilibrado inicial EDITABLE: 500 UYU/mes máximo de mensajería, 1.500 UYU/mes de responsabilidad estimada de incentivos, 25 destinatarios únicos/semana, 2 campañas nuevas/semana, máximo 1 promoción por cliente cada 14 días y 2 en 30, ventana local 10–20, máximo por campaña de 25% de ambas bolsas combinadas SIN romper ninguna bolsa individual. Si el negocio no configuró moneda, zona horaria o presupuesto, bloquear efectos externos y solicitar configuración. NO activar automáticamente para negocios existentes.

Implementar consentimiento granular por canal con origen, timestamp, versión, revocación y supresión, preservando compatibilidad sin equiparar ausencia de opt-out con autorización. Validar WhatsApp: plantillas aprobadas fuera de ventana de atención, sus precios/limitaciones del proveedor y envío solo a contactos elegibles. Debe haber cálculo de costo de mensajes y responsabilidad económica máxima de premios aún pendientes, con reservas atómicas antes de comprometer gasto y reconciliación/caducidad. Si no se puede estimar el costo, no ofrecer automáticamente ese beneficio.

Reglas duras no negociables incluso si el modelo insiste. Garantizar control de concurrencia, historial de auditoría, dry-run, idempotencia, pausas ante errores/bajas/quejas, y políticas por rol. Crear tests unitarios e integración para todos los topes y casos límite. No habilitar campañas automáticas todavía.
```

**Salida para aceptar:** no se puede exceder consentimiento, frecuencia, horarios, costo ni permisos ni siquiera mediante tool call manual/maliciosa.

---

## Prompt 7 — Autonomía equilibrada real, integrada con Autopilot

```text
Con el chat, herramientas, consentimientos y Policy & Budget Engine ya probados, implementemos Modo A autónomo equilibrado. Intelligence debe detectar oportunidades de negocio de manera proactiva y usar Retention V2 / Autopilot como ÚNICO motor de envío/ejecución. NO crear un cron de envío ni pipeline de WhatsApp paralelo.

Estrategias iniciales: segunda visita, cliente que demora más de su frecuencia esperada, inactivo, cerca de premio, beneficio vigente por vencer y cohorte con descenso de visitas. Si hay pocos datos, usar reglas de negocio explícitas y señalar incertidumbre, sin fingir comportamiento aprendido. Orden de incentivos: sin descuento → recordatorio de progreso o beneficio ya adquirido → incentivo únicamente desde catálogo aprobado. No modificar reglas globales automáticamente. Limitar a dos campañas nuevas por semana y presupuestos del motor. Elegir una estrategia por vez con grupos chicos cuando el negocio solo tenga ~105 clientes.

Diseñar proceso: detectar → evaluar → preparar → autorizar por política → reservar costo → programar → ejecutar → registrar estados → medir → explicar. Implementar historial 'Actividad autónoma' en Intelligence: oportunidades encontradas, descartadas con motivo, drafts, envíos, costos, visitas/canjes atribuibles, métricas y bloqueos. Si cero acciones, EXPLICAR CAUSA con conteos reales y sugerir alternativas válidas; jamás evadir consentimiento o enviar por probar.

Integrar flags de rollout por negocio. Primero DRY-RUN; tests con 0, 10, 105 y miles de clientes, consentimiento parcial, presupuestos agotados, retention legacy activo, cola caída, doble cron, reintentos y acceso cruzado. No mandar mensajes reales hasta aprobar explícitamente un piloto acotado; verificar que legacy no duplique envíos. Documentar pasos exactos del rollout y rollback.
```

**Salida para aceptar:** el piloto puede operar dentro de política y deja trazabilidad incluso si no hay campañas elegibles.

---

## Prompt 8 — Cierre de módulo, QA, release y costo

```text
Hacé una auditoría final de Flikker Intelligence antes de habilitarlo a clientes. Compará la implementación con estos requisitos: chat persistente con título editable, multi-turn, streaming, análisis real, reportes/exports, herramientas ejecutoras, Modo A proactivo bajo política autorizada, Modo B bajo pedido y confirmación, Activity Log, costo y consentimiento.

Revisá técnicamente: tenant isolation, roles, protección frente a prompt injection, no PII innecesaria a OpenAI, logs sin secretos, límites de tokens/herramientas, timeout/reintentos, streaming interrumpido, operaciones idempotentes, permisos de confirmación, tests frontend en CI, migraciones no destructivas, colas, WhatsApp templates/ventanas y controles de gasto. Corregí los hallazgos por PRs pequeños con tests. No hagas deploy productivo sin aprobación.

Calculá costo aproximado por chat/negocio a partir de la telemetría real de AiUsage y precios configurables; separá costo de IA, mensajería y recompensas. Prepará un plan de piloto con un negocio (el de ~105 clientes si hay acceso autorizado), checklist de activación explícita, criterios de éxito, métricas de retención, monitoreo 7/30 días, rollback y manual simple de usuario. Entregame una lista verificable de pendientes para habilitar producción.
```

**Salida para aceptar:** checklist de producción aprobado y piloto controlado, sin asumir resultados que aún no existen.

---

## Secuencia de aceptación

| Paso | Qué deberías tener antes de avanzar |
|---|---|
| 0 | Estado real del código y diagnóstico del bloqueo de Autopilot |
| 1–2 | Sección Intelligence con chats persistentes y usable en PC/celular |
| 3 | Agente OpenAI conversacional real y con herramientas read-only |
| 4 | Informes exactos, tablas, gráficos y descargas |
| 5 | Acciones controladas y confirmaciones seguras |
| 6 | Consentimiento, presupuestos y límites fiables |
| 7 | Autonomía con Retention V2, primero dry-run, luego piloto autorizado |
| 8 | Seguridad, pruebas, costos, piloto y rollout documentados |

**IMPORTANTE:** no subir a producción automatizaciones activas simplemente porque pasan tests. La aprobación inicial del comercio, controles efectivos de privacidad y las pruebas reales del motor de envíos son requisitos previos.
