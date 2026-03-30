# responses.md

## 1. Propósito del módulo

El módulo `responses` resuelve la capa operativa de respuesta a reseñas dentro de Flikker OS.

Su objetivo no es solo “guardar un texto de respuesta”, sino permitir que un negocio responda de forma:

- rápida
- consistente con su tono
- segura
- auditable
- escalable operativamente

Este módulo cubre la generación asistida, edición, aprobación, publicación y trazabilidad de respuestas a reseñas.

En términos prácticos, convierte una review en una acción operativa concreta.

---

## 2. Qué representa una response

Una `response` es la respuesta oficial o propuesta a una reseña.

Dependiendo del flujo, una respuesta puede existir en distintos estados:

- borrador generado por IA
- borrador creado manualmente
- respuesta editada por un operador
- respuesta aprobada
- respuesta publicada
- respuesta descartada

Este módulo también contempla que una misma review pueda tener:

- varias versiones de propuesta
- una respuesta final elegida
- historial de cambios
- aprobación previa antes de publicar

---

## 3. Objetivo funcional

El objetivo del módulo es permitir que el negocio pueda:

- redactar respuestas más rápido
- mantener consistencia de tono
- tratar mejor reseñas negativas
- evitar respuestas impulsivas o malas
- guardar historial de cambios
- controlar quién responde y qué se publica
- medir tiempos de respuesta a futuro

Sin este módulo, el sistema puede mostrar reviews, pero no puede ayudar a operarlas bien.

---

## 4. Alcance del módulo

### Incluye

- creación manual de respuestas
- sugerencias asistidas por IA
- edición de borradores
- versiones de respuesta
- aprobación opcional
- publicación o marcado de publicada
- descarte de propuestas
- historial
- notas operativas básicas
- reglas por score / severidad en el futuro cercano

### No incluye todavía

- publicación automática masiva real a plataformas externas complejas
- inbox omnicanal
- chat interno grande
- moderación compleja multi-etapa enterprise
- workflows BPM gigantes
- modelos avanzados de scoring emocional
- entrenamiento custom complejo por cliente en fase temprana

---

## 5. Rol del módulo dentro de la arquitectura

`responses` depende directamente del módulo de `reviews` y vive dentro del contexto de negocio.

Orden natural:

1. auth
2. users
3. memberships
4. businesses
5. reviews
6. responses
7. analytics
8. notifications

Este módulo está cerca del corazón del valor del producto, porque reduce el tiempo y la fricción de responder.

---

## 6. Reglas de negocio principales

### Regla 1

Toda response pertenece a una `review`.

### Regla 2

Toda response hereda el contexto de tenancy desde la review y el business.

### Regla 3

No se debe permitir responder una review de otro business.

### Regla 4

Puede existir más de una propuesta de respuesta para una misma review, pero debe haber una única respuesta final activa/publicada por review, salvo diseño futuro especial.

### Regla 5

Una respuesta puede originarse manualmente o mediante IA.

### Regla 6

Las respuestas sensibles, especialmente ante reseñas negativas, pueden requerir aprobación antes de marcarse como listas o publicadas.

### Regla 7

No se deben borrar físicamente respuestas en operación normal; se descartan o se versionan.

### Regla 8

Cada cambio importante de texto debería poder quedar auditado.

### Regla 9

El tono sugerido debe poder variar por negocio y eventualmente por score o plantilla.

### Regla 10

Una response no debe asumir que ya fue publicada externamente si el sistema aún no integra esa publicación real.

### Regla 11

Debe quedar claro si algo es:

- sugerencia
- borrador editable
- respuesta final
- respuesta publicada
- respuesta descartada

### Regla 12

El sistema debe permitir intervención humana siempre; la IA asiste, no manda sola.

---

## 7. Casos de uso principales

### Caso de uso 1 — Generar sugerencia con IA

Un operador abre una review y pide una propuesta de respuesta.

### Caso de uso 2 — Crear respuesta manual

Un usuario redacta una respuesta sin usar IA.

### Caso de uso 3 — Editar borrador

Se modifica una propuesta antes de aprobarla o publicarla.

### Caso de uso 4 — Aprobar respuesta

Un rol autorizado valida el contenido antes de su uso final.

### Caso de uso 5 — Marcar como publicada

Se registra que la respuesta ya fue usada/publicada.

### Caso de uso 6 — Descartar propuesta

Una sugerencia mala o irrelevante se descarta sin borrarla.

### Caso de uso 7 — Ver historial de versiones

Se consulta cómo fue cambiando la propuesta.

### Caso de uso 8 — Escalar caso negativo

Una review delicada requiere revisión especial antes de responder.

---

## 8. Entidades del módulo

## 8.1 Response

Entidad principal del módulo.

Campos sugeridos:

- `id`
- `businessId`
- `reviewId`
- `status`
- `source`
- `content`
- `language` (opcional)
- `tone` (opcional)
- `isFinal`
- `isPublished`
- `publishedAt` (opcional)
- `approvedAt` (opcional)
- `approvedByUserId` (opcional)
- `createdByUserId` (opcional)
- `lastEditedByUserId` (opcional)
- `discardedAt` (opcional)
- `discardReason` (opcional)
- `createdAt`
- `updatedAt`

### Explicación de campos

- `source`: indica si viene de IA, plantilla o manual
- `isFinal`: indica si fue elegida como la respuesta final de trabajo
- `isPublished`: indica si ya fue publicada o marcada como usada
- `status`: expresa la etapa operativa

---

## 8.2 ResponseVersion

Sirve para histórico y trazabilidad de cambios.

Campos sugeridos:

- `id`
- `responseId`
- `versionNumber`
- `content`
- `changeReason` (opcional)
- `editedByUserId` (opcional)
- `createdAt`

### Nota

Si el MVP necesita velocidad extrema, se puede arrancar sin esta tabla y crearla apenas el flujo madure.
Pero idealmente conviene contemplarla desde diseño.

---

## 8.3 ResponseTemplate

Plantillas reutilizables por negocio.

Campos sugeridos:

- `id`
- `businessId`
- `name`
- `status`
- `category` (opcional)
- `minRating` (opcional)
- `maxRating` (opcional)
- `tone`
- `content`
- `isDefault`
- `createdByUserId`
- `createdAt`
- `updatedAt`

### Ejemplos de uso

- plantilla para 5 estrellas
- plantilla para queja leve
- plantilla para reseña sin texto
- plantilla para reseña negativa escalable

---

## 8.4 ResponsePolicy

Opcional a futuro si se quiere separar reglas operativas.

Campos sugeridos:

- `id`
- `businessId`
- `requiresApprovalBelowRating`
- `autoSuggestEnabled`
- `defaultTone`
- `escalateNegativeReviews`
- `negativeThreshold`
- `createdAt`
- `updatedAt`

### Nota

En MVP puede vivir dentro de settings de negocio.

---

## 9. Modelo de estados

Estados sugeridos para `response.status`:

- `draft`
- `pending_approval`
- `approved`
- `published`
- `discarded`

### Significado

#### `draft`

Respuesta en preparación. Puede venir de IA o manual.

#### `pending_approval`

Respuesta que requiere revisión de un rol superior.

#### `approved`

Respuesta validada y lista para uso/publicación.

#### `published`

Respuesta ya publicada o marcada como usada externamente.

#### `discarded`

Respuesta descartada, retenida solo para histórico.

### Reglas

- `published` no debería seguir editándose libremente
- `discarded` no debe volver a mostrarse como candidata principal
- `approved` puede pasar a `published`
- `draft` puede reescribirse varias veces
- `pending_approval` sirve especialmente para negativas o políticas internas

---

## 10. Origen de la respuesta

Campo sugerido: `source`

Valores posibles:

- `manual`
- `ai_generated`
- `template`
- `ai_template_based`

### Motivo

Distinguir cómo nació la respuesta sirve para auditoría, análisis y mejora futura del producto.

---

## 11. Relaciones con otros módulos

### Con `reviews`

Cada response pertenece a una review.

### Con `businesses`

Toda response existe dentro de un business.

### Con `users`

Usuarios crean, editan, aprueban o publican respuestas.

### Con `analytics`

A futuro puede medir:

- tiempo hasta primera propuesta
- tiempo hasta publicación
- tasa de respuesta
- uso de IA vs manual

### Con `notifications`

Puede disparar alertas cuando una review negativa requiere respuesta o aprobación.

### Con `templates`

Las plantillas ayudan a generar borradores consistentes.

---

## 12. Diseño de tenancy

Este módulo debe ser estrictamente tenant-scoped.

### Reglas

- no acceder a responses de reviews ajenas
- no permitir crear response sobre review de otro business
- no aprobar/publicar fuera del scope autorizado
- si la review define business, la response debe heredar ese mismo business
- nunca confiar en `businessId` del frontend si ya se puede derivar desde la review

### Recomendación

Derivar `businessId` desde `reviewId` cuando se pueda para reducir riesgos de inconsistencia.

---

## 13. Permisos sugeridos

### Platform Admin

Puede:

- ver todas las respuestas
- intervenir en casos especiales
- auditar historial

### Business Owner

Puede:

- ver respuestas
- crear
- editar
- aprobar
- marcar publicadas
- gestionar plantillas

### Business Admin

Puede:

- crear
- editar
- aprobar
- publicar
- descartar

### Operator

Puede:

- generar sugerencias
- crear manualmente
- editar borradores
- enviar a aprobación
- tal vez publicar si la política lo permite

### Viewer

Puede:

- leer respuestas e historial visible
- no editar
- no aprobar
- no publicar

---

## 14. Campos mínimos para MVP

Para crear una response en MVP, mínimo sugerido:

- `reviewId`
- `content`
- `source`
- `status` inicial por default `draft`

Campos opcionales:

- `tone`
- `language`
- `createdByUserId`

### Motivo

Permitir avanzar rápido sin bloquear el flujo por metadata excesiva.

---

## 15. Validaciones de negocio

### `reviewId`

- requerido
- debe existir
- debe pertenecer al tenant correcto

### `content`

- requerido
- trim automático
- no vacío luego del trim
- longitud máxima razonable

### `source`

- requerido
- enum válido

### `status`

- enum válido

### `tone`

- opcional
- enum o string controlado si se normaliza luego

### Aprobación

- no cualquiera puede aprobar
- `approvedByUserId` solo debe existir si el estado y el permiso lo justifican

### Publicación

- `publishedAt` solo debe existir si `isPublished = true` o `status = published`

---

## 16. Reglas de actualización

### Se puede actualizar

- contenido de borradores
- tono
- estado
- flags de final/publicada
- razón de descarte
- metadata de aprobación

### Debe cuidarse especialmente

- editar contenido ya publicado
- múltiples respuestas marcadas como finales
- aprobar sin permiso
- cambiar business indirectamente
- perder historial de cambios

### Recomendación

Cuando cambie el contenido de una respuesta ya existente:

- crear versión nueva
- actualizar `lastEditedByUserId`
- auditar el cambio si el historial es importante

---

## 17. Endpoints sugeridos

## 17.1 Crear respuesta manual

### `POST /responses`

### Request ejemplo

```json
{
  "reviewId": "rev_123",
  "content": "¡Muchas gracias por tu reseña! Nos alegra saber que tu experiencia fue tan buena.",
  "source": "manual"
}
```

### Response ejemplo

```json
{
  "id": "res_123",
  "reviewId": "rev_123",
  "status": "draft",
  "source": "manual",
  "isFinal": false,
  "isPublished": false,
  "createdAt": "2026-03-29T12:00:00.000Z"
}
```

## 17.2 Generar sugerencia con IA

### `POST /responses/generate`

### Request ejemplo

```json
{
  "reviewId": "rev_123",
  "tone": "warm_professional"
}
```

### Comportamiento esperado

- toma la review
- usa tono/configuración del negocio si existe
- genera borrador
- guarda `source = ai_generated`
- deja estado `draft`

## 17.3 Listar respuestas por review

### `GET /reviews/:reviewId/responses`

### Uso

Ver historial de propuestas y respuesta final asociadas a una review.

## 17.4 Obtener response por ID

### `GET /responses/:responseId`

## 17.5 Actualizar contenido de response

### `PATCH /responses/:responseId`

## 17.6 Enviar a aprobación

### `POST /responses/:responseId/request-approval`

### Uso

Mover una `draft` a `pending_approval`.

## 17.7 Aprobar response

### `POST /responses/:responseId/approve`

### Uso

Cambiar a `approved`.

## 17.8 Marcar como publicada

### `POST /responses/:responseId/publish`

### Uso

Registrar que ya fue publicada o utilizada.

### Nota

En MVP esto puede ser solo un cambio de estado, sin integración externa real.

## 17.9 Descartar response

### `POST /responses/:responseId/discard`

### Uso

Descartar sugerencia sin hard delete.

## 17.10 Marcar como final

### `POST /responses/:responseId/mark-final`

### Uso

Seleccionar la propuesta elegida para esa review.

### Regla

Debe haber a lo sumo una final por review.

## 18. DTOs sugeridos

### `CreateResponseDto`

- `reviewId`
- `content`
- `source`
- `tone?`
- `language?`

### `GenerateResponseDto`

- `reviewId`
- `tone?`
- `templateId?`

### `UpdateResponseDto`

- `content?`
- `tone?`
- `status?`

### `ApproveResponseDto`

- `note?`

### `DiscardResponseDto`

- `reason?`

### `ResponseFiltersDto`

- `reviewId?`
- `status?`
- `source?`
- `page?`
- `limit?`

## 19. Eventos internos posibles

- `response.created`
- `response.generated`
- `response.updated`
- `response.approval_requested`
- `response.approved`
- `response.published`
- `response.discarded`
- `response.marked_final`

### Estos eventos pueden servir para

- activity log
- analytics
- alertas
- métricas de SLA
- seguimiento interno

## 20. Auditoría

### Acciones que deberían auditarse

- generación IA
- creación manual
- edición de contenido
- cambio de estado
- aprobación
- publicación
- descarte
- marcado como final

### Campos útiles

- `actorUserId`
- `businessId`
- `reviewId`
- `responseId`
- `action`
- `previousValue` resumido
- `newValue` resumido
- `timestamp`

## 21. Edge cases a contemplar

### Caso 1

Dos operadores generan respuesta para la misma review.

### Solución

- permitir múltiples borradores
- marcar una sola como final

### Caso 2

Se intenta aprobar una respuesta ya descartada.

### Solución

- bloquear transición inválida

### Caso 3

Se edita una respuesta ya publicada.

### Solución

- restringir edición o generar nueva versión / no permitir según política

### Caso 4

Review negativa requiere aprobación obligatoria.

### Solución

- política por negocio o rating threshold

### Caso 5

Se elimina o cambia la review asociada.

### Solución

- no permitir romper integridad
- `response` siempre ligada a review existente

### Caso 6

La IA genera texto malo o riesgoso.

### Solución

- siempre revisión humana
- IA produce `draft`, no publicación directa por defecto

### Caso 7

Múltiples respuestas finales para una misma review.

### Solución

- constraint lógica y/o transacción que garantice una sola final

### Caso 8

No hay integración real con Google u otra plataforma todavía.

### Solución

- separar claramente `approved` de `published`
- si `published` es manual, dejarlo explícito

## 22. Qué NO hacer en este módulo

- no publicar automáticamente respuestas sensibles sin control
- no borrar historial por comodidad
- no mezclar este módulo con inbox omnicanal todavía
- no asumir integración externa completa desde el día uno
- no dejar permisos ambiguos de aprobación
- no permitir inconsistencias entre review y business
- no confiar en frontend para validar seguridad o tenancy

## 23. UI mínima necesaria

La UI debe ser operativa y muy simple.

### Pantallas mínimas sugeridas

### 1. Panel de respuestas dentro de la review

Debe mostrar:

- contenido de la review
- respuestas existentes
- estado
- autor / origen
- acción de editar / generar / aprobar / publicar

### 2. Editor de respuesta

Debe permitir:

- ver borrador
- editar texto
- guardar
- descartar
- enviar a aprobación

### 3. Acción de generar con IA

Botón simple que cree una propuesta.

### 4. Historial básico

Mostrar versiones o al menos propuestas anteriores si existen.

### Regla UI oficial

Nada de experiencia visual compleja.  
Nada de composer sofisticado estilo soporte enterprise.  
Solo flujo claro para:

- generar
- editar
- aprobar
- marcar publicada

## 24. Datos demo sugeridos

### Ejemplo 1

- `reviewId: rev_001`
- `source: ai_generated`
- `status: draft`
- `content: "¡Gracias por tu reseña! Nos alegra saber que disfrutaste tu experiencia con nosotros."`

### Ejemplo 2

- `reviewId: rev_002`
- `source: manual`
- `status: approved`
- `content: "Lamentamos lo ocurrido y agradecemos que nos lo hayas comentado. Queremos ayudarte a resolverlo."`

### Ejemplo 3

- `reviewId: rev_003`
- `source: template`
- `status: published`
- `content: "Muchas gracias por tu confianza y por tomarte el tiempo de dejarnos tu opinión."`

## 25. Tests mínimos recomendados

### Unit tests

- validación de transiciones de estado
- regla de una sola final por review
- helpers de tono o selección de plantilla si existen

### Integration tests

- crear response sobre review accesible
- impedir crear sobre review ajena
- generar draft con IA
- editar borrador
- solicitar aprobación
- aprobar con permisos correctos
- impedir aprobación sin permiso
- descartar sin borrar
- marcar una sola response como final

### Contract / API tests

- `POST /responses`
- `POST /responses/generate`
- `GET /reviews/:reviewId/responses`
- `PATCH /responses/:id`
- `POST /responses/:id/approve`
- `POST /responses/:id/publish`
- `POST /responses/:id/discard`
- `POST /responses/:id/mark-final`

### E2E futuros

- login
- abrir review
- generar propuesta
- editar
- aprobar
- marcar como publicada

## 26. Orden recomendado de implementación

- definir relación `Review -> Response`
- schema Prisma de `Response`
- DTOs
- service para creación / edición / cambio de estado
- guards / policies
- endpoints principales
- tests integración
- generación IA básica
- frontend mínimo dentro de detalle de review
- versions / templates si la tanda lo permite

## 27. Definición de “done” del módulo

El módulo `responses` está suficientemente listo cuando:

- se puede crear respuesta manual
- se puede generar sugerencia IA
- se puede editar un borrador
- se puede aprobar o descartar
- se puede marcar como final / publicada
- respeta tenancy
- no permite responder reviews ajenas
- tiene tests mínimos
- tiene UI mínima operativa dentro de una review

## 28. Recomendación operativa importante

En el MVP conviene que la publicación externa real no sea el primer problema a resolver.

Primero hay que dejar bien resuelto:

- `draft`
- edición
- aprobación
- `final`
- registro operativo de “ya respondida”

Después se conecta publicación externa real si aporta valor suficiente.

## 29. Resumen práctico

`responses` es uno de los módulos donde más valor perceptible puede generar Flikker OS.

### La prioridad acá es

- velocidad operativa
- consistencia de tono
- control humano
- historial razonable
- permisos correctos
- tenancy correcto
- UI mínima sin sobrecomplicar
