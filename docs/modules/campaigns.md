# campaigns.md

## 1. Propósito del módulo

El módulo `campaigns` representa el motor de captación y atribución de reseñas dentro de Flikker OS.

Su función principal es permitir crear iniciativas trazables para pedir reseñas mediante QR, links u otros puntos de contacto, asociando cada interacción a un negocio, una sucursal y un contexto operativo concreto.

Este módulo resuelve:

- creación de campañas de captación
- agrupación lógica de links y QRs
- trazabilidad de origen
- organización por negocio y sucursal
- activación y desactivación de campañas
- soporte para análisis de rendimiento
- base para atribución de scans, clicks y conversiones

En términos simples: una campaña es el contenedor operativo que explica **desde dónde** y **cómo** se están intentando conseguir reseñas.

---

## 2. Qué representa una campaign

Una `campaign` no es una campaña publicitaria compleja tipo ads manager.

Dentro del producto, una campaña representa una iniciativa concreta de adquisición de reseñas, por ejemplo:

- QR en mostrador
- QR en caja
- link enviado por WhatsApp
- link enviado por email post-compra
- tarjeta impresa con QR
- campaña temporal por evento
- campaña para una sucursal específica
- campaña para un profesional o equipo dentro del negocio

La campaña sirve para ordenar, medir y comparar fuentes de captación.

---

## 3. Objetivo funcional

El objetivo del módulo es permitir que el negocio pueda:

- crear puntos de captación con intención clara
- diferenciar orígenes de tráfico
- medir qué canal genera más interacción
- sostener trazabilidad sin depender de adivinanzas
- conectar los eventos previos a la reseña con una fuente operativa real

Sin campañas, el sistema puede captar reseñas, pero no puede explicar bien qué está funcionando.

---

## 4. Alcance del módulo

### Incluye

- alta de campañas
- lectura y edición de campañas
- activación / pausa / archivo lógico
- asociación a negocio
- asociación opcional a sucursal
- clasificación por canal
- configuración base de destino
- relación con QR codes y links
- métricas básicas de captación
- soporte para tracking y analytics

### No incluye todavía

- campañas de paid media
- automatizaciones de email marketing complejas
- journeys omnicanal
- segmentación avanzada de audiencias
- reglas complejas de remarketing
- AB testing sofisticado
- automatizaciones profundas de CRM
- campañas sociales complejas

---

## 5. Rol del módulo dentro de la arquitectura

`campaigns` es un módulo core de negocio.

Dependencias naturales:

1. auth
2. users
3. memberships
4. businesses
5. branches
6. campaigns
7. qr-codes / redirect-events
8. reviews
9. analytics

Este módulo es puente entre estructura de cuenta y adquisición real.

---

## 6. Reglas de negocio principales

### Regla 1

Toda campaña pertenece a un `business`.

### Regla 2

Una campaña puede pertenecer opcionalmente a una `branch`, pero nunca a una branch de otro business.

### Regla 3

Una campaña debe tener un nombre claro y un canal/origen entendible.

### Regla 4

Una campaña no se elimina físicamente en operación normal; se archiva o desactiva.

### Regla 5

Solo usuarios con permisos suficientes pueden crear o editar campañas.

### Regla 6

Una campaña puede estar en borrador antes de publicarse.

### Regla 7

Una campaña archivada no debe aceptar nueva operación activa normal.

### Regla 8

Una campaña debe poder asociarse a uno o más activos de captación, como links o QR codes.

### Regla 9

Las métricas de campañas no deben ser cargadas manualmente como verdad principal; idealmente se derivan de eventos.

### Regla 10

Toda campaña debe quedar scopeada por tenancy en backend.

### Regla 11

Si la campaña tiene destino público configurable, ese destino debe validarse y no dejar huecos inseguros.

### Regla 12

Las campañas deben ser comparables entre sí, por lo que conviene normalizar canal, estado y metadata operativa.

---

## 7. Casos de uso principales

### Caso de uso 1 — Crear campaña

Un owner/admin crea una campaña para pedir reseñas desde un canal específico.

### Caso de uso 2 — Asociar campaña a sucursal

Se crea una campaña específica para una branch concreta.

### Caso de uso 3 — Generar QR o link desde campaña

La campaña sirve de contexto para crear activos trazables.

### Caso de uso 4 — Pausar campaña

Se detiene temporalmente una campaña sin perder histórico.

### Caso de uso 5 — Archivar campaña

Se deja de usar, pero se retiene su información y métricas.

### Caso de uso 6 — Medir rendimiento

Se observan scans, clicks o conversiones asociados a la campaña.

### Caso de uso 7 — Duplicar campaña

Se reutiliza una configuración similar para otra sucursal o canal, si luego se implementa.

---

## 8. Entidades del módulo

## 8.1 Campaign

Entidad principal del módulo.

Campos sugeridos:

- `id`
- `businessId`
- `branchId` (opcional)
- `name`
- `slug` o `code` (opcional, según necesidad)
- `description` (opcional)
- `status`
- `channel`
- `sourceType`
- `goal` (opcional)
- `defaultDestinationType`
- `defaultDestinationUrl` (opcional)
- `startsAt` (opcional)
- `endsAt` (opcional)
- `isActive`
- `createdByUserId`
- `createdAt`
- `updatedAt`
- `archivedAt` (opcional)

### Notas

- `businessId` es obligatorio
- `branchId` es opcional
- `status` conviene manejarlo como enum
- `channel` y `sourceType` no tienen que ser idénticos si se quiere más semántica

---

## 8.2 CampaignSettings

Opcional si se desea separar reglas operativas.

Campos sugeridos:

- `id`
- `campaignId`
- `sendToReviewDirectly`
- `enableIntermediateLanding`
- `collectInternalFeedbackFirst`
- `appendUtmParameters`
- `notifyOnThresholdReached`
- `createdAt`
- `updatedAt`

### Nota

En MVP puede quedar embebido dentro de `Campaign` si no crece mucho.

---

## 8.3 CampaignMetricSnapshot

No obligatoria al inicio, pero útil a futuro.

Campos sugeridos:

- `id`
- `campaignId`
- `date`
- `scanCount`
- `clickCount`
- `conversionCount`
- `reviewCountAttributed`
- `createdAt`

### Nota

En MVP conviene derivar desde eventos y no abrir esta tabla todavía si no hace falta.

---

## 9. Modelo de estados

Estados sugeridos para `campaign.status`:

- `draft`
- `active`
- `paused`
- `completed`
- `archived`

### Significado

#### `draft`

Campaña creada pero todavía no publicada o no usada.

#### `active`

Campaña operativa y disponible para captar tráfico.

#### `paused`

Campaña detenida temporalmente.

#### `completed`

Campaña cerrada como finalizada, útil si fue temporal.

#### `archived`

Campaña fuera de operación normal, solo para histórico.

### Reglas

- solo `active` debería participar plenamente en operación normal
- `paused` conserva histórico y configuración
- `completed` es semánticamente útil para campañas temporales
- `archived` debe bloquear nuevas ediciones sensibles o reuso accidental

---

## 10. Clasificación por canal

Campos sugeridos para `channel`:

- `qr_counter`
- `qr_table`
- `qr_receipt`
- `whatsapp`
- `email`
- `sms`
- `manual_link`
- `in_person`
- `event`
- `other`

### Recomendación

Usar un enum chico y claro al principio.

---

## 11. Tipos de destino sugeridos

Campo sugerido: `defaultDestinationType`

Valores posibles:

- `google_review`
- `landing_page`
- `internal_feedback_then_redirect`
- `custom_url`

### Explicación

Esto permite que la campaña no sea solo una etiqueta, sino que también ayude a entender cuál es el flujo esperado de destino.

---

## 12. Relaciones con otros módulos

### Con `businesses`

Cada campaña pertenece a un business.

### Con `branches`

Una campaña puede pertenecer opcionalmente a una sucursal.

### Con `qr-codes`

Una campaña puede tener uno o varios QR codes asociados.

### Con `redirect-events`

Los eventos de scans/clicks pueden quedar asociados a la campaña.

### Con `reviews`

Las reseñas eventualmente pueden atribuirse a la campaña si el flujo lo permite.

### Con `analytics`

Las métricas por campaña son clave para comparación de rendimiento.

### Con `widgets`

No se relaciona directamente de forma fuerte, pero ambas viven bajo el business.

---

## 13. Diseño de tenancy

Este módulo es completamente tenant-scoped.

### Reglas

- nunca listar campañas globales salvo endpoint interno de plataforma
- toda campaña leída o modificada debe validarse contra `businessId` accesible por el usuario
- no aceptar `branchId` que pertenezca a otro business
- no permitir crear campañas fuera del contexto de negocio autorizado
- toda métrica o evento derivado debe mantener el mismo scope

### Riesgos a evitar

- actualizar campañas de otro negocio por conocer el ID
- mezclar campañas de branches cruzadas
- devolver campañas archivadas o de otro tenant en vistas activas por error
- usar filtros del frontend como única defensa

---

## 14. Permisos sugeridos

### Platform Admin

Puede:

- listar todas las campañas
- ver todas
- crear para cualquier business
- editar cualquier campaña
- archivar/reactivar

### Business Owner

Puede:

- crear campañas
- editar campañas
- activar/pausar/archivar
- ver métricas de su negocio

### Business Admin

Puede:

- crear campañas
- editar campañas
- pausar campañas
- ver métricas

### Operator

Puede:

- ver campañas
- crear algunas campañas si se habilita
- editar ciertos campos no sensibles si la política lo permite

### Viewer

Puede:

- ver campañas y métricas básicas
- no debería editar

---

## 15. Campos mínimos para MVP

Para crear una campaña en MVP, mínimo sugerido:

- `businessId`
- `name`
- `channel`
- `status` inicial o default `draft`

Opcionales desde el inicio:

- `branchId`
- `description`
- `defaultDestinationType`
- `defaultDestinationUrl`
- `startsAt`
- `endsAt`

### Motivo

Permitir crear campañas rápido sin atascar el flujo.

---

## 16. Validaciones de negocio

### `name`

- requerido
- longitud razonable
- trim automático
- no vacío tras trim

### `channel`

- requerido
- debe pertenecer al enum permitido

### `businessId`

- requerido
- debe existir y ser accesible

### `branchId`

- opcional
- si existe, debe pertenecer al mismo business

### `status`

- restringido a enum válido

### `defaultDestinationUrl`

- opcional
- URL válida si se informa
- no permitir esquemas peligrosos

### `startsAt` / `endsAt`

- si ambos existen, `endsAt` no puede ser anterior a `startsAt`

### `defaultDestinationType`

- restringido a enum válido si se informa

---

## 17. Reglas de actualización

### Se puede actualizar

- nombre
- descripción
- canal si todavía no rompe reporting o activos ya generados
- estado
- destino por defecto
- fechas
- branch asociada si aplica

### Debe cuidarse especialmente

- cambio de business
- cambio de branch
- cambio de estado
- cambio de destino cuando ya existen QRs activos
- cambios que impacten atribución histórica

### Recomendación

- no permitir mover una campaña a otro business
- si existe necesidad futura, duplicar en vez de mover
- al archivar, conservar todo el histórico intacto

---

## 18. Endpoints sugeridos

## 18.1 Crear campaña

`POST /campaigns`

### Request ejemplo

```json
{
  "businessId": "bus_123",
  "branchId": "br_456",
  "name": "QR mostrador marzo",
  "channel": "qr_counter",
  "description": "Campaña para captar reseñas en caja",
  "defaultDestinationType": "google_review",
  "status": "draft"
}
```

### Response ejemplo

```json
{
  "id": "cmp_123",
  "businessId": "bus_123",
  "branchId": "br_456",
  "name": "QR mostrador marzo",
  "channel": "qr_counter",
  "status": "draft",
  "createdAt": "2026-03-29T12:00:00.000Z"
}
```

## 18.2 Listar campañas del negocio

### `GET /campaigns`

### Query params sugeridos

- `businessId`
- `branchId`
- `status`
- `channel`
- `search`
- `page`
- `limit`

### Regla

Siempre validado por tenancy.

---

## 18.3 Obtener campaña por ID

### `GET /campaigns/:campaignId`

---

## 18.4 Actualizar campaña

### `PATCH /campaigns/:campaignId`

---

## 18.5 Cambiar estado de campaña

### `PATCH /campaigns/:campaignId/status`

### Uso

Activar, pausar, completar o archivar.

---

## 18.6 Archivar campaña

### `POST /campaigns/:campaignId/archive`

### Nota

Puede existir como endpoint explícito o resolverse vía cambio de estado.

---

## 18.7 Métricas de campaña

### `GET /campaigns/:campaignId/metrics`

### Uso

Traer métricas derivadas de eventos o snapshots.

---

## 18.8 Duplicar campaña

### `POST /campaigns/:campaignId/duplicate`

### Nota

No obligatorio en MVP, pero buen candidato más adelante.

---

## 19. DTOs sugeridos

### `CreateCampaignDto`

- `businessId`
- `branchId?`
- `name`
- `description?`
- `channel`
- `defaultDestinationType?`
- `defaultDestinationUrl?`
- `startsAt?`
- `endsAt?`
- `status?`

### `UpdateCampaignDto`

- todos opcionales
- con restricciones sobre campos sensibles

### `UpdateCampaignStatusDto`

- `status`
- `reason?`

### `CampaignFiltersDto`

- `businessId`
- `branchId?`
- `status?`
- `channel?`
- `search?`
- `page?`
- `limit?`

---

## 20. Eventos internos posibles

- `campaign.created`
- `campaign.updated`
- `campaign.status_changed`
- `campaign.archived`
- `campaign.activated`
- `campaign.paused`
- `campaign.completed`

Estos eventos pueden alimentar:

- activity logs
- analytics
- onboarding
- notificaciones internas
- automatizaciones futuras

---

## 21. Auditoría

### Acciones que deberían auditarse

- creación de campaña
- edición de nombre
- cambio de canal
- cambio de branch
- cambio de destino
- activación
- pausa
- archivo
- reactivación

### Campos útiles

- `actorUserId`
- `businessId`
- `campaignId`
- `action`
- `previousValue` resumido
- `newValue` resumido
- `timestamp`

---

## 22. Edge cases a contemplar

## Caso 1

**Usuario intenta asociar campaña a branch de otro business.**

### Solución

- validación estricta backend

## Caso 2

**Campaña archivada sigue apareciendo como activa en UI.**

### Solución

- filtros claros por estado
- defaults bien definidos

## Caso 3

**Campaña con fechas inválidas.**

### Solución

- validación DTO
- validación de dominio

## Caso 4

**Cambio de destino rompe QR ya impreso.**

### Solución

- definir si el QR apunta a redirect estable o a destino directo
- preferir redirects estables en arquitectura

## Caso 5

**Campaña sin branch asociada.**

### Solución

- permitirlo si la campaña es a nivel negocio

## Caso 6

**Canal mal normalizado genera analytics inconsistentes.**

### Solución

- usar enums cerrados al inicio

## Caso 7

**Métricas infladas por bots o scans duplicados.**

### Solución

- tratarlo luego en eventos / analytics
- no resolverlo con hacks en `campaign`

---

## 23. Qué NO hacer en este módulo

- no convertir campañas en sistema de marketing automation gigante
- no mezclar lógica pesada de QR dentro de la entidad `campaign`
- no meter métricas manuales como fuente principal
- no permitir cambio arbitrario de `business`
- no depender de frontend para tenancy
- no usar estados ambiguos sin enum claro
- no crear filtros y reporting ultra complejos en el MVP

---

## 24. UI mínima necesaria

La UI de campañas debe ser operativa, no sofisticada.

## Pantallas mínimas sugeridas

### 1. Listado de campañas

Debe mostrar:

- nombre
- canal
- estado
- branch si aplica
- fecha de creación
- acción de ver / editar

### 2. Formulario de creación

Debe pedir:

- nombre
- branch opcional
- canal
- descripción opcional
- destino opcional

### 3. Detalle de campaña

Debe mostrar:

- datos base
- estado
- branch
- destino
- QRs o links asociados cuando existan
- métricas básicas cuando existan

### 4. Acción rápida de estado

- activar
- pausar
- archivar

desde una UI simple.

### Regla UI oficial

Nada de dashboards complejos ni diseñador visual.  
Solo CRUD claro y usable.

---

## 25. Datos demo sugeridos

### Ejemplo 1

- `name: QR mostrador marzo`
- `channel: qr_counter`
- `status: active`
- `businessId: bus_gains`
- `branchId: br_centro`

### Ejemplo 2

- `name: WhatsApp post compra`
- `channel: whatsapp`
- `status: active`
- `businessId: bus_gains`

### Ejemplo 3

- `name: Evento expo fitness`
- `channel: event`
- `status: completed`
- `businessId: bus_gains`

---

## 26. Tests mínimos recomendados

### Unit tests

- validación de transición de estados
- validación de fechas
- normalización de enums o helpers si existen

### Integration tests

- crear campaña dentro de business accesible
- impedir creación en business ajeno
- impedir usar branch de otro business
- listar solo campañas del tenant
- actualizar campaña con permisos correctos
- cambiar estado correctamente
- archivar sin borrar

### Contract / API tests

- `POST /campaigns`
- `GET /campaigns`
- `GET /campaigns/:id`
- `PATCH /campaigns/:id`
- `PATCH /campaigns/:id/status`

### E2E futuros

- login
- elegir negocio
- crear campaña
- editar campaña
- pausar campaña
- ver listado filtrado

---

## 27. Orden recomendado de implementación

1. schema Prisma de `Campaign`
2. relación con `Business`
3. relación opcional con `Branch`
4. DTOs
5. service
6. controller
7. guards / policies
8. tests de integración
9. listado mínimo en frontend
10. creación / edición mínima
11. métricas si ya existen eventos asociados

---

## 28. Definición de “done” del módulo

El módulo `campaigns` está suficientemente listo cuando:

- se puede crear campaña
- se puede listar por negocio
- se puede editar lo básico
- se puede activar / pausar / archivar
- respeta tenancy
- valida coherencia entre business y branch
- se conecta bien con QR / links cuando existan
- tiene tests mínimos
- tiene UI mínima operativa

---

## 29. Recomendación de diseño técnico importante

Conviene que los QR o links públicos no apunten directo al destino final rígido, sino a un redirect controlado por el sistema.

### Motivo

- permite cambiar destino después
- conserva trazabilidad
- evita romper impresos
- simplifica analytics

### Implicación

`campaign` define contexto, pero el redirect / event layer resuelve la navegación pública.

---

## 30. Resumen práctico

`campaigns` es el módulo que transforma “pedir reseñas” en algo medible y ordenado.

### La prioridad acá es

- claridad de origen
- tenancy correcto
- estados simples
- buena relación con business / branch
- base sólida para QR, tracking y analytics
- UI mínima sin humo
