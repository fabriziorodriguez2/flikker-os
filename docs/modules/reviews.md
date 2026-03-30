# reviews.md

## 1. Propósito del módulo

El módulo `reviews` representa el inbox operativo de reseñas dentro de Flikker OS.

Es el módulo que permite convertir opiniones dispersas en una base ordenada, filtrable y accionable para el negocio.

Su objetivo no es solamente almacenar reviews, sino permitir que el sistema pueda:

- centralizar reseñas
- clasificarlas
- filtrarlas
- priorizarlas
- asociarlas al negocio y a la sucursal correcta
- prepararlas para respuesta, reutilización y análisis

En términos prácticos, `reviews` es la capa que transforma reputación externa en operación interna.

---

## 2. Qué representa una review

Una `review` es una unidad de feedback atribuible a una fuente externa o interna, ligada a un negocio y eventualmente a una sucursal, campaña o canal de captación.

Una review puede incluir:

- calificación
- texto
- autor visible
- fuente
- fecha original
- metadata de contexto
- estado operativo interno
- tags
- relación con respuestas
- relación con campaña o canal, si se puede atribuir

La review es uno de los activos más importantes del sistema, porque después alimenta:

- respuestas
- widgets
- contenido
- analytics
- health score de cuenta

---

## 3. Objetivo funcional

El objetivo del módulo es permitir que el negocio pueda:

- ver todas sus reseñas en un solo lugar
- distinguir positivas, neutras y negativas
- saber cuáles requieren acción
- organizar el trabajo del equipo
- asociar reseñas a su contexto operativo
- preparar reseñas para respuesta o reutilización
- tener trazabilidad mínima del estado de cada caso

Sin este módulo, el sistema puede captar tráfico, pero no operar bien la reputación.

---

## 4. Alcance del módulo

### Incluye

- almacenamiento de reviews
- carga manual o ingestión base
- relación con business y branch
- relación opcional con campaign
- score/rating
- texto
- metadata básica
- estados operativos
- tags
- filtros
- ordenamiento
- detección básica de duplicados
- relación con responses
- selección de reviews destacables para usos futuros

### No incluye todavía

- sincronización enterprise compleja con múltiples plataformas
- moderación automática avanzada
- sentiment analysis complejo como eje central
- machine learning de clasificación sofisticado
- inbox omnicanal
- flujos BPM grandes
- consolidación mágica de identidades cross-platform muy avanzada

---

## 5. Rol del módulo dentro de la arquitectura

`reviews` es un módulo central del producto.

Orden natural de dependencia:

1. auth
2. users
3. memberships
4. businesses
5. branches
6. campaigns / tracking
7. reviews
8. responses
9. widgets
10. analytics
11. content assets

Este módulo recibe contexto desde negocio/campaña y luego alimenta múltiples módulos downstream.

---

## 6. Reglas de negocio principales

### Regla 1

Toda review debe pertenecer a un `business`.

### Regla 2

Una review puede pertenecer opcionalmente a una `branch`.

### Regla 3

Si una review se atribuye a una `campaign`, esa campaña debe pertenecer al mismo business.

### Regla 4

Toda review debe tener una `source` clara o al menos una procedencia identificable.

### Regla 5

Toda review debe tener un `status` operativo interno, aunque su fuente externa no lo tenga.

### Regla 6

No se debe hacer hard delete de reviews en operación normal.

### Regla 7

Una review puede tener cero, una o varias propuestas de respuesta, pero como operación debería existir una respuesta final elegida.

### Regla 8

Las reviews negativas o de baja puntuación deben poder detectarse y priorizarse fácilmente.

### Regla 9

Las reviews duplicadas deben evitarse o al menos marcarse como sospechosas si el mismo evento ingresa dos veces.

### Regla 10

La información externa original de una review debe preservarse razonablemente para auditoría.

### Regla 11

El acceso a reviews debe estar completamente scopeado por tenancy.

### Regla 12

El estado operativo interno no debe confundirse con el estado original de la plataforma fuente.

---

## 7. Casos de uso principales

### Caso de uso 1 — Ver inbox de reviews

Un usuario entra al panel y ve todas las reseñas del negocio con filtros.

### Caso de uso 2 — Filtrar reviews negativas

El operador detecta rápido las reseñas de 1 a 3 estrellas o las que están pendientes de respuesta.

### Caso de uso 3 — Cargar review manualmente

Se registra una reseña desde una fuente no integrada o por import simple.

### Caso de uso 4 — Atribuir review a una campaña

Cuando existe trazabilidad previa, se relaciona la reseña con el canal o campaña correspondiente.

### Caso de uso 5 — Marcar review como respondida

Luego de operar la respuesta, la review cambia de estado operativo.

### Caso de uso 6 — Taggear review

Se agregan etiquetas como “producto”, “atención”, “precio”, “negativa”, “testimonio fuerte”, etc.

### Caso de uso 7 — Seleccionar review destacada

Una reseña especialmente útil se marca para widget o reutilización futura.

### Caso de uso 8 — Detectar posible duplicado

Se evita contaminar métricas con el mismo review repetido.

---

## 8. Entidades del módulo

## 8.1 Review

Entidad principal del módulo.

Campos sugeridos:

- `id`
- `businessId`
- `branchId` (opcional)
- `campaignId` (opcional)
- `source`
- `externalReviewId` (opcional)
- `authorDisplayName` (opcional)
- `authorExternalId` (opcional)
- `rating`
- `title` (opcional)
- `content` (opcional)
- `reviewedAt`
- `ingestedAt`
- `status`
- `sentimentLabel` (opcional, simple)
- `language` (opcional)
- `isHighlighted`
- `isHidden`
- `requiresAttention`
- `responseStatus`
- `metadataJson` (opcional)
- `createdAt`
- `updatedAt`
- `archivedAt` (opcional)

### Explicación

- `reviewedAt`: fecha original de la reseña
- `ingestedAt`: fecha en que entró al sistema
- `status`: estado operativo interno
- `responseStatus`: resumen del estado de respuesta
- `metadataJson`: para conservar datos de fuente sin romper el modelo base

---

## 8.2 ReviewTag

Tags reutilizables o relación tag-review.

Si se modela con tabla separada, puede haber:

### Tag

- `id`
- `businessId`
- `name`
- `slug`
- `color` (opcional)
- `createdAt`

### ReviewTagRelation

- `reviewId`
- `tagId`
- `createdAt`

### Nota

En MVP puede arrancar con tags simples y después sofisticarse.

---

## 8.3 ReviewStatusHistory

Opcional pero útil si se quiere trazabilidad de estados.

Campos sugeridos:

- `id`
- `reviewId`
- `fromStatus` (opcional)
- `toStatus`
- `changedByUserId` (opcional)
- `reason` (opcional)
- `createdAt`

---

## 8.4 ReviewSourceSnapshot

Opcional si se quiere preservar payload externo relevante.

Campos sugeridos:

- `id`
- `reviewId`
- `source`
- `rawPayloadJson`
- `fetchedAt`

### Nota

Muy útil si luego hay sincronización o debugging.

---

## 9. Modelo de estados operativos

Estados sugeridos para `review.status`:

- `new`
- `triaged`
- `pending_response`
- `responded`
- `resolved`
- `archived`

### Significado

#### `new`

Review recién ingresada, aún no revisada operativamente.

#### `triaged`

Review ya vista y clasificada, pero todavía no necesariamente respondida.

#### `pending_response`

Review marcada como necesitando respuesta.

#### `responded`

Ya tiene respuesta operativa final o fue marcada como respondida.

#### `resolved`

No requiere más acción interna.

#### `archived`

Fuera del flujo normal, retenida por histórico.

### Regla

El estado operativo es interno y no depende necesariamente del estado externo en la plataforma fuente.

---

## 10. Estado de respuesta resumido

Campo sugerido: `responseStatus`

Valores posibles:

- `not_needed`
- `not_started`
- `draft_exists`
- `pending_approval`
- `published`
- `manually_handled`

### Motivo

Esto permite filtrar rápido sin leer todas las responses asociadas.

---

## 11. Fuentes sugeridas

Campo `source` como enum acotado al principio:

- `google`
- `manual`
- `import_csv`
- `whatsapp_feedback`
- `email_feedback`
- `internal_form`
- `other`

### Recomendación

No abrir demasiadas fuentes al principio.
Mejor pocos valores claros que una lista infinita confusa.

---

## 12. Rating / score

Campo `rating`:

- entero o decimal según fuente
- normalizar idealmente a escala 1–5 si la fuente lo permite

### Reglas

- si la fuente usa otra escala, guardar original en metadata si hace falta
- para MVP, la comparación interna debe tender a una escala simple

---

## 13. Relaciones con otros módulos

### Con `businesses`

Toda review pertenece a un business.

### Con `branches`

Puede pertenecer a una sucursal si el dato existe o aplica.

### Con `campaigns`

Puede quedar atribuida a una campaña si el tracking previo lo permite.

### Con `responses`

Cada review puede tener respuestas propuestas/finales.

### Con `widgets`

Reviews destacadas pueden exponerse luego en widgets.

### Con `content assets`

Reviews especialmente buenas pueden transformarse en piezas o testimonios.

### Con `analytics`

Las reviews son insumo para:

- cantidad de reseñas
- promedio de rating
- velocidad de respuesta
- evolución por campaña
- salud por sucursal

---

## 14. Diseño de tenancy

Este módulo debe estar completamente tenant-scoped.

### Reglas

- ninguna review de otro business debe ser visible o editable
- si se consulta por ID, validar acceso real del usuario
- al crear/importar, validar coherencia entre business, branch y campaign
- no confiar en filtros del frontend
- si `campaignId` o `branchId` viene informado, debe pertenecer al mismo `businessId`

### Recomendación

Siempre que se pueda, derivar el contexto de negocio desde relaciones existentes y validarlo en backend.

---

## 15. Permisos sugeridos

### Platform Admin

Puede:

- ver todas las reviews
- auditar
- operar casos especiales
- corregir errores de import o ingestión

### Business Owner

Puede:

- ver todas las reviews del negocio
- cambiar estados
- taggear
- destacar
- ocultar
- gestionar flujo operativo

### Business Admin

Puede:

- ver todas las reviews del negocio
- cambiar estados
- taggear
- destacar
- operar respuestas

### Operator

Puede:

- ver reviews
- filtrar
- cambiar algunos estados
- taggear
- preparar respuesta
- marcar necesidades de acción

### Viewer

Puede:

- ver reviews
- aplicar filtros básicos según política
- no editar estados sensibles

---

## 16. Campos mínimos para MVP

Para cargar una review en MVP, mínimo sugerido:

- `businessId`
- `source`
- `rating`
- `reviewedAt`
- `status` default `new`

Opcionales muy importantes:

- `content`
- `authorDisplayName`
- `branchId`
- `campaignId`
- `externalReviewId`

### Motivo

No frenar el sistema si una reseña llega incompleta, pero sí guardar suficiente contexto para operarla.

---

## 17. Validaciones de negocio

### `businessId`

- requerido
- debe existir
- debe ser accesible según tenancy

### `branchId`

- opcional
- si existe, debe pertenecer al mismo business

### `campaignId`

- opcional
- si existe, debe pertenecer al mismo business

### `source`

- requerido
- enum válido

### `rating`

- requerido en la mayoría de casos
- rango razonable
- idealmente normalizado a 1–5

### `content`

- opcional, porque algunas reseñas pueden traer solo score
- trim automático si existe

### `reviewedAt`

- requerido
- debe ser fecha válida

### `status`

- enum válido

### `externalReviewId`

- opcional
- si existe junto con `source`, conviene usarlo en deduplicación

---

## 18. Duplicados

La detección de duplicados no tiene que ser perfecta desde el día uno, pero sí razonable.

### Candidatos para deduplicar

- mismo `source`
- mismo `externalReviewId`
- mismo `businessId`
- misma fecha aproximada
- mismo autor y mismo contenido

### Recomendación

Tener al menos una de estas estrategias:

1. constraint por `source + externalReviewId + businessId` cuando exista `externalReviewId`
2. flag de `possibleDuplicate` si la coincidencia es heurística
3. proceso manual de revisión para casos dudosos

### Importante

No eliminar automáticamente sin certeza fuerte.

---

## 19. Reglas de actualización

### Se puede actualizar

- estado operativo
- tags
- `isHighlighted`
- `requiresAttention`
- `responseStatus`
- branch/campaign si la atribución fue corregida
- metadata operativa interna

### Debe cuidarse especialmente

- contenido original
- rating original
- reviewedAt original
- externalReviewId
- source original

### Recomendación

Preservar la data original externa y evitar “editar la reseña” como si fuera contenido interno.

---

## 20. Endpoints sugeridos

## 20.1 Crear review manual

`POST /reviews`

### Request ejemplo

```json
{
  "businessId": "bus_123",
  "branchId": "br_456",
  "source": "manual",
  "rating": 5,
  "content": "Excelente atención y muy buena experiencia.",
  "authorDisplayName": "Cliente anónimo",
  "reviewedAt": "2026-03-28T15:00:00.000Z"
}
```

### Response ejemplo

```json
{
  "id": "rev_123",
  "businessId": "bus_123",
  "branchId": "br_456",
  "source": "manual",
  "rating": 5,
  "status": "new",
  "responseStatus": "not_started",
  "createdAt": "2026-03-29T12:00:00.000Z"
}
```

## 20.2 Listar reviews

### `GET /reviews`

### Query params sugeridos

- `businessId`
- `branchId`
- `campaignId`
- `status`
- `responseStatus`
- `source`
- `ratingMin`
- `ratingMax`
- `requiresAttention`
- `isHighlighted`
- `search`
- `page`
- `limit`
- `sortBy`
- `sortOrder`

## 20.3 Obtener review por ID

### `GET /reviews/:reviewId`

## 20.4 Actualizar estado de review

### `PATCH /reviews/:reviewId/status`

### Request ejemplo

```json
{
  "status": "pending_response",
  "reason": "Review negativa requiere seguimiento"
}
```

## 20.5 Actualizar metadata operativa

### `PATCH /reviews/:reviewId`

### Uso

Actualizar flags como:

- `requiresAttention`
- `isHighlighted`
- `responseStatus`
- `branch/campaign` si corresponde
- ocultar internamente si existiera esa política

## 20.6 Agregar tags a review

### `POST /reviews/:reviewId/tags`

## 20.7 Quitar tag de review

### `DELETE /reviews/:reviewId/tags/:tagId`

## 20.8 Marcar como destacada

### `POST /reviews/:reviewId/highlight`

## 20.9 Desmarcar destacada

### `POST /reviews/:reviewId/unhighlight`

## 20.10 Importar reviews

### `POST /reviews/import`

### Nota

No obligatorio en primera tanda, pero muy útil más adelante para carga manual masiva.

## 21. DTOs sugeridos

### `CreateReviewDto`

- `businessId`
- `branchId?`
- `campaignId?`
- `source`
- `externalReviewId?`
- `authorDisplayName?`
- `rating`
- `title?`
- `content?`
- `reviewedAt`

### `UpdateReviewDto`

- `branchId?`
- `campaignId?`
- `requiresAttention?`
- `isHighlighted?`
- `responseStatus?`
- `isHidden?`

### `UpdateReviewStatusDto`

- `status`
- `reason?`

### `ReviewFiltersDto`

- `businessId`
- `branchId?`
- `campaignId?`
- `status?`
- `responseStatus?`
- `source?`
- `ratingMin?`
- `ratingMax?`
- `requiresAttention?`
- `isHighlighted?`
- `search?`
- `page?`
- `limit?`
- `sortBy?`
- `sortOrder?`

## 22. Eventos internos posibles

- `review.created`
- `review.ingested`
- `review.updated`
- `review.status_changed`
- `review.tag_added`
- `review.tag_removed`
- `review.highlighted`
- `review.unhighlighted`
- `review.marked_attention`
- `review.response_status_changed`

### Estos eventos pueden alimentar

- activity log
- analytics
- notificaciones
- automatizaciones futuras
- health score de cuenta

## 23. Auditoría

### Acciones que deberían auditarse

- creación manual
- ingestión/importación
- cambio de estado
- cambio de branch/campaign
- agregado/remoción de tags
- destacado
- ocultado
- cambios en flags operativos

### Campos útiles

- `actorUserId`
- `businessId`
- `reviewId`
- `action`
- `previousValue` resumido
- `newValue` resumido
- `timestamp`

## 24. Edge cases a contemplar

### Caso 1

Review sin texto, solo score.

### Solución

- permitirla
- no asumir que `content` es obligatorio

### Caso 2

Review importada dos veces.

### Solución

- deduplicación por `source + externalReviewId` o marca de posible duplicado

### Caso 3

Review con `campaignId` de otro business.

### Solución

- validación estricta backend

### Caso 4

Review negativa queda perdida entre cientos de positivas.

### Solución

- filtros por rating y `requiresAttention`
- orden por prioridad o fecha

### Caso 5

Review ya respondida externamente, pero el sistema no lo sabe bien.

### Solución

- usar `responseStatus` operativo interno y permitir corrección manual

### Caso 6

Review archivada sigue apareciendo en inbox principal.

### Solución

- filtros por defecto que excluyan `archived`

### Caso 7

Cambios manuales pisan información original externa.

### Solución

- separar data original de metadata operativa interna

### Caso 8

Reviews de varias sucursales se mezclan.

### Solución

- `branch` opcional pero bien validada y bien filtrable

## 25. Qué NO hacer en este módulo

- no convertirlo en un monstruo de moderación enterprise
- no mezclar respuesta completa dentro de la tabla principal si rompe claridad
- no depender solo del frontend para filtros sensibles
- no hacer hard delete normal
- no editar como si fuera propio el contenido original de la reseña
- no abrir 500 fuentes externas antes de tener un flujo simple sólido
- no meter analytics compleja dentro del modelo base de reviews

## 26. UI mínima necesaria

### La UI de reviews debe ser funcional y extremadamente clara

### Pantallas mínimas sugeridas

### 1. Inbox / listado de reviews

Debe mostrar:

- `rating`
- `autor`
- `extracto de texto`
- `source`
- `fecha`
- `estado`
- `responseStatus`
- `tags`
- `acción de abrir`

### 2. Filtros básicos

Debe permitir filtrar por:

- `rating`
- `estado`
- `responseStatus`
- `branch`
- `campaign`
- `source`
- `destacadas`
- `atención requerida`

### 3. Detalle de review

Debe mostrar:

- `texto completo`
- `metadata base`
- `tags`
- `estado`
- `respuesta asociada o acceso al módulo de responses`
- `acciones rápidas`

### 4. Acciones rápidas

- `cambiar estado`
- `marcar atención`
- `destacar`
- `taggear`

### Regla UI oficial

No construir una experiencia visual compleja tipo helpdesk enterprise.  
Primero un inbox limpio, filtros claros y detalle usable.

## 27. Datos demo sugeridos

### Ejemplo 1

- `source: google`
- `rating: 5`
- `content: "Excelente atención, muy recomendable."`
- `authorDisplayName: "María P."`
- `status: new`
- `responseStatus: not_started`

### Ejemplo 2

- `source: google`
- `rating: 2`
- `content: "Me atendieron bien pero demoraron demasiado."`
- `authorDisplayName: "Carlos R."`
- `status: pending_response`
- `responseStatus: draft_exists`
- `requiresAttention: true`

### Ejemplo 3

- `source: manual`
- `rating: 4`
- `content: "Muy buena experiencia general."`
- `authorDisplayName: "Cliente tienda"`
- `status: resolved`
- `responseStatus: published`
- `isHighlighted: true`

## 28. Tests mínimos recomendados

### Unit tests

- validación de transiciones de estado
- reglas de deduplicación básica si existen helpers
- normalización de rating o source si aplica

### Integration tests

- crear review dentro de business accesible
- impedir crear en business ajeno
- validar coherencia entre business, branch y campaign
- listar solo reviews del tenant
- cambiar estado correctamente
- agregar y quitar tags
- marcar destacada
- detectar o bloquear duplicados fuertes

### Contract / API tests

- `POST /reviews`
- `GET /reviews`
- `GET /reviews/:id`
- `PATCH /reviews/:id`
- `PATCH /reviews/:id/status`
- `POST /reviews/:id/tags`
- `POST /reviews/:id/highlight`

### E2E futuros

- login
- entrar al negocio
- ver inbox
- filtrar negativas
- abrir review
- marcar atención
- pasar a respuesta

## 29. Orden recomendado de implementación

- schema Prisma de `Review`
- relación con `Business`
- relación opcional con `Branch`
- relación opcional con `Campaign`
- DTOs
- service de CRUD operativo
- filtros y paginación
- guards / policies de tenancy
- tests integración
- listado mínimo frontend
- detalle de review
- tags y flags operativos
- import o ingestión si entra en la tanda

## 30. Definición de “done” del módulo

El módulo `reviews` está suficientemente listo cuando:

- se puede crear o ingestar review
- se puede listar por negocio con filtros útiles
- se puede abrir detalle
- se puede cambiar estado operativo
- se puede marcar atención o destacar
- se puede relacionar con responses
- respeta tenancy
- valida coherencia entre business/branch/campaign
- tiene tests mínimos
- tiene UI mínima operativa

## 31. Recomendación técnica importante

### Conviene separar claramente

- data original de fuente externa
- metadata operativa interna
- resumen de respuesta
- relación con campañas/branches

Eso evita que el módulo se vuelva una bolsa confusa de campos.

### Una buena aproximación es

- `Review` como entidad central
- `metadataJson` o snapshot para datos externos no esenciales
- `responseStatus` como resumen rápido
- tablas auxiliares solo cuando realmente den valor

## 32. Resumen práctico

`reviews` es el inbox real del producto.

### La prioridad acá es

- centralizar bien
- filtrar bien
- priorizar bien
- conectar bien con respuestas
- respetar tenancy
- mantener modelo claro
- dejar una UI simple y operativa, sin sobrecomplicar
