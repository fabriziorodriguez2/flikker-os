Leé primero estos archivos antes de escribir código:

- ARCHITECTURE.md
- PRODUCT_SCOPE.md
- CLAUDE.md
- PHASE_0.md
- documentación de Fase 2 y Fase 3 relevante del repo
- docs/modules/reviews.md si existe
- docs/modules/review_inbox.md si existe

Contexto:
La Fase 2 ya está cerrada o suficientemente cerrada.
Ahora quiero arrancar la Fase 3 — Reseñas.

La definición exacta de Fase 3 para este proyecto es:

- modelo `review`, `review_source`, `review_tag`, `review_status`
- carga manual inicial y/o sincronización desde integración disponible
- detección de duplicados por `source_review_id`
- filtros por estrellas, fecha, sucursal, campaña, estado, etiqueta y uso
- clasificación automática por sentimiento y tema
- reglas: pendiente, respondida, destacada, negativa crítica, usada en widget, usada en asset

No uses una interpretación genérica.

No escribas código todavía.

Primero devolveme únicamente:

1. qué ya está resuelto desde Fase 2 que impacta Fase 3
2. qué falta exactamente para cerrar Fase 3
3. un plan en pasos chicos, mergeables y en orden correcto
4. qué archivos tocarías en cada paso
5. riesgos de tenancy, ingestión, duplicados y clasificación
6. qué NO conviene mezclar en el mismo PR

---

Leé primero estos archivos antes de escribir código:

- ARCHITECTURE.md
- PRODUCT_SCOPE.md
- CLAUDE.md
- PHASE_0.md
- documentación relevante de Fase 3 del repo
- docs/modules/reviews.md si existe

Contexto:
Vamos a empezar Fase 3 — Reseñas.

En esta primera tanda quiero implementar únicamente la base backend del módulo de reviews.

Alcance de esta tanda:

1. schema y migración de reviews
2. DTOs base
3. repository + service core
4. sin frontend todavía
5. sin import CSV
6. sin respuestas IA
7. sin widgets ni assets

Debe incluir:

- modelo `Review`
- modelo `ReviewTag`
- tabla puente review-tag si corresponde
- `ReviewStatusHistory`
- enums necesarios
- relación con `businessId`
- relación opcional con `branchId`
- relación opcional con `campaignId`
- `source`
- `externalReviewId` nullable
- `rating`
- `body`
- `authorName` si aplica
- `reviewedAt`
- `sentimentLabel` simple derivado del rating
- flags o campos mínimos que preparen el terreno para fases siguientes

Importante:

- separar claramente estado operativo de flags
- mantener tenant isolation estricto
- validar que `branchId` y `campaignId`, si existen, pertenezcan al mismo `businessId`
- no implementar todavía tag CRUD completo si no es necesario
- no implementar importaciones externas
- no usar una interpretación genérica de Fase 3

Deduplicación:

- quiero una estrategia clara para evitar duplicados por `[businessId, source, externalReviewId]` cuando `externalReviewId` exista
- si Prisma no soporta partial unique index como lo necesitamos, proponé la solución más pragmática y segura

Primero devolveme:

1. plan corto
2. archivos a tocar
3. decisiones de modelado importantes
4. estrategia de deduplicación
5. riesgos técnicos

Después recién implementá.

Al final devolveme:

- resumen de cambios
- migraciones creadas
- modelo final
- cómo probar deduplicación, tenancy y `sentimentLabel`
- deuda pendiente antes de inbox y frontend
- corré lint, typecheck y tests afectados

---

Leé primero la implementación actual del módulo de reviews antes de escribir código.

Contexto:
Ya existe la base backend del módulo de reviews.
Ahora quiero dejar operativo el inbox backend, sin frontend todavía.

En esta segunda tanda quiero implementar únicamente:

1. controllers
2. endpoints del inbox
3. filtros backend
4. cambio de estado básico
5. tests

Debe incluir:

- endpoint para crear reseña manual
- endpoint para listar reseñas del negocio
- endpoint para ver detalle de reseña
- endpoint para actualizar estado operativo de reseña
- filtros por:
  - rating
  - fecha
  - branch
  - campaign
  - estado
  - tag
  - flags de uso si ya existen
- paginación
- orden razonable
- contratos API claros

Importante:

- mantener tenant isolation estricto
- todas las queries deben filtrar por `businessId`
- no implementar todavía frontend
- no implementar respuestas IA
- no implementar widgets ni assets
- no hacer import CSV
- no meter analytics avanzados

Quiero que el estado operativo quede claro y no mezclado con flags.
Si hace falta, proponé una convención simple y consistente.

Primero devolveme:

1. plan corto
2. endpoints/DTOs/tests a crear o ajustar
3. cómo resolvés performance e índices
4. edge cases de tenancy y permisos

Después recién implementá.

Al final devolveme:

- resumen de cambios
- contratos API
- cómo probar filtros, detalle y cambio de estado
- qué quedó pendiente antes de frontend
- corré lint, typecheck y tests afectados

---

Leé primero el estado actual del módulo de reviews antes de escribir código.

Contexto:
Ya tenemos schema, services y endpoints base del inbox.
Ahora quiero cerrar la parte operativa mínima antes del frontend.

En esta tercera tanda quiero implementar únicamente:

1. clasificación simple por sentimiento basada en rating
2. seeds demo realistas
3. hardening mínimo de observabilidad y validaciones del módulo

Debe incluir:

- `sentimentLabel` simple y explícito, derivado del rating
- no usar LLM ni IA real en esta fase
- seeds idempotentes con reseñas variadas:
  - positivas
  - neutras
  - negativas
  - distintas branches/campaigns si aplica
  - algunos estados operativos distintos
  - algunos tags si el modelo ya los soporta
- logs útiles en:
  - creación manual
  - deduplicación
  - cambio de estado
- validaciones razonables para evitar datos basura

Reglas:

- no implementar todavía frontend
- no hacer import CSV
- no tocar respuestas IA
- no tocar widgets ni assets
- no agregar complejidad innecesaria

Primero devolveme:

1. plan corto
2. archivos a tocar
3. cómo definís `sentimentLabel`
4. qué escenarios cubrirán las seeds
5. qué logs mínimos agregarías

Después recién implementá.

Al final devolveme:

- resumen de cambios
- cómo correr las seeds
- escenarios demo disponibles
- cómo probar clasificación, deduplicación y estados
- deuda pendiente antes del frontend inbox
- corré lint, typecheck y tests afectados

---

Leé primero el backend actual del módulo de reviews antes de escribir código.

Contexto:
Ya existe backend base, filtros y seeds demo del módulo de reviews.
Ahora quiero solo el frontend mínimo necesario para operar Fase 3.

En esta cuarta tanda quiero implementar únicamente el shell frontend del inbox de reseñas.

Debe incluir:

- ruta o sección de inbox de reviews
- listado de reseñas
- filtros mínimos conectados al backend
- vista de detalle
- badges o señales visuales para:
  - rating
  - estado operativo
  - `sentimentLabel`
- estados de loading, empty, error y success razonables
- UI mínima, usable, sin sobrepulir

Reglas:

- no implementar respuestas IA
- no tocar widgets ni assets
- no hacer diseño pesado
- no agregar dashboards bonitos
- no meter analytics avanzados
- priorizar operación, no estética

Importante:

- mantener consistencia con el design system actual
- no inventar contratos API nuevos si ya existen
- no sobreconstruir manejo de tags si todavía no está maduro
- ocultar o simplificar todo lo que todavía no tenga soporte backend real

Primero devolveme:

1. estructura de rutas
2. pantallas y componentes mínimos
3. endpoints/backend que vas a consumir
4. decisiones UI mínimas
5. qué NO vas a implementar todavía

Después recién implementá.

Al final devolveme:

- resumen de cambios
- qué flujos de Fase 3 ya quedan operables desde UI
- cómo probar el inbox completo
- qué quedó pendiente antes de Fase 4
- corré typecheck y tests afectados

---

Actuá como staff engineer auditando el proyecto contra la definición oficial de Fase 3.

No escribas código.
No modifiques archivos.

Leé primero:

- ARCHITECTURE.md
- PRODUCT_SCOPE.md
- CLAUDE.md
- PHASE_0.md
- documentación relevante de Fase 3 del repo
- implementación actual del módulo de reviews
- tests relevantes

La Fase 3 en este proyecto significa:

- modelo `review`, `review_tag`, `review_status` o equivalente consistente
- carga manual inicial de reseñas
- estrategia de deduplicación por `source_review_id` cuando aplique
- filtros por estrellas, fecha, sucursal, campaña, estado, etiqueta y uso
- clasificación básica por sentimiento y/o tema en la medida definida para esta fase
- inbox usable desde backend y frontend mínimo
- estados operativos claros, separados de flags de uso
- tenancy segura entre business, branch, campaign y review
- seeds demo realistas

Quiero que audites:

- schema y migraciones
- tenancy y validaciones cross-entity
- deduplicación
- diseño de estados vs flags
- filtros y performance
- contratos API
- frontend inbox mínimo
- seeds demo
- observabilidad mínima
- deuda técnica antes de Fase 4

Devolveme únicamente:

1. Qué puntos de Fase 3 están efectivamente cumplidos
2. Qué puntos siguen flojos, ambiguos o incompletos
3. Riesgos reales antes de entrar a Fase 4
4. Qué arreglarías sí o sí antes de respuestas IA
5. Qué cosas están suficientemente bien y no tocarías
6. Si Fase 3 ya puede considerarse cerrada o no, con justificación concreta
7. Un checklist final en orden de prioridad con lo último que corregirías si faltara algo

No seas complaciente.
Priorizá criterio técnico, simplicidad operativa y velocidad de aprendizaje.
