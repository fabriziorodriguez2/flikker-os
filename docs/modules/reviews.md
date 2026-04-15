# reviews.md

## 1. Objetivo

El módulo `reviews` existe para operar reseñas reales de forma simple y usable.

En este MVP, su propósito no es hacer análisis sofisticado.
Su propósito es permitir que el negocio:

- cargue reseñas
- las vea en un inbox simple
- las filtre
- marque cuáles están respondidas
- destaque las que sirven para prueba social
- las asocie al negocio y, si aplica, a una campaña o fuente

Este módulo debe servir para operar pilotos reales como Gains sin sobreconstrucción.

---

## 2. Qué entra / qué no entra

### Qué entra en el MVP

- carga manual de reseñas
- import simple opcional
- listado
- filtros básicos
- detalle simple
- estado operativo de reseña
- marcar destacada
- marcar respondida
- asociar reseña a negocio
- asociar reseña a campaña o fuente si aplica

### Qué no entra ahora

- clasificación automática por sentimiento
- clasificación automática por tema
- integraciones pesadas con plataformas externas
- timeline sofisticada
- cola de moderación avanzada
- reglas complejas para negativas
- automatizaciones complejas
- analítica sofisticada dentro del módulo

### Regla

Si una propuesta no mejora directamente la operación del inbox del MVP, queda fuera.

---

## 3. Entidades mínimas

El modelo debe ser chico y orientado a operación.

### 3.1 Review

Entidad principal del módulo.

Campos mínimos sugeridos:

- `id`
- `businessId`
- `campaignId` opcional
- `source`
- `authorDisplayName` opcional
- `rating`
- `content` opcional
- `reviewedAt`
- `status`
- `isHighlighted`
- `respondedAt` opcional
- `respondedByUserId` opcional
- `createdAt`
- `updatedAt`

### Notas

- `businessId` es obligatorio
- `campaignId` es opcional
- `source` puede ser manual, importada o atribuida a un canal simple
- `respondedAt` y `respondedByUserId` permiten registrar operación real sin abrir todavía el módulo de responses completo

### 3.2 Import simple opcional

Si existe import, no hace falta un submodelo complejo.
Puede resolverse con:

- carga manual masiva
- CSV simple
- proceso básico sin pipeline sofisticado

### Regla

No abrir tablas de clasificación, snapshots ricos, timelines o colas de moderación si no aportan valor inmediato al piloto.

---

## 4. Estados válidos

Los estados deben ser simples y útiles para operación real.

### Estados mínimos recomendados

- `new`
- `reviewed`
- `responded`
- `archived`

### Significado

#### `new`

Reseña recién cargada o recién ingresada al inbox.

#### `reviewed`

Reseña ya vista por el equipo, pero no necesariamente respondida.

#### `responded`

Reseña marcada como ya respondida operativamente.

#### `archived`

Reseña fuera del flujo activo.

### Regla

No abrir más estados si no cambian una acción real del equipo.

---

## 5. Endpoints mínimos

Los endpoints tienen que alcanzar para cargar, listar, filtrar y operar el inbox.

### Privados

- `POST /reviews`
  Crear reseña manual.

- `POST /reviews/import`
  Import simple opcional si entra en esta etapa.

- `GET /reviews`
  Listar reseñas del negocio activo con filtros básicos.

- `GET /reviews/:reviewId`
  Ver detalle de reseña.

- `PATCH /reviews/:reviewId`
  Actualizar metadata operativa simple.

- `PATCH /reviews/:reviewId/status`
  Cambiar estado.

- `POST /reviews/:reviewId/highlight`
  Marcar como destacada.

- `POST /reviews/:reviewId/unhighlight`
  Quitar destacada.

- `POST /reviews/:reviewId/mark-responded`
  Marcar reseña como respondida.

### Filtros mínimos sugeridos para `GET /reviews`

- `status`
- `source`
- `ratingMin`
- `ratingMax`
- `isHighlighted`
- `responded`
- `campaignId`
- `search`

### Regla

No abrir endpoints de moderación avanzada, clasificación automática o reglas complejas de workflow.

---

## 6. UI mínima

La UI debe ser un inbox simple y usable.

### Pantallas mínimas

#### 1. Listado de reseñas

Debe mostrar:

- rating
- autor si existe
- extracto de texto
- source
- campaña si aplica
- estado
- destacada sí o no
- respondida sí o no
- fecha

#### 2. Filtros básicos

Debe permitir filtrar por:

- estado
- respondida
- destacada
- source
- rating
- campaña

#### 3. Detalle simple

Debe mostrar:

- contenido completo
- metadata básica
- estado
- relación con campaña si existe
- acciones rápidas

#### 4. Acciones rápidas

- cambiar estado
- marcar respondida
- marcar destacada
- editar asociación a campaña si corresponde

### Regla UI

No construir una experiencia tipo helpdesk enterprise.
Necesitamos un inbox claro y rápido de operar.

---

## 7. Reglas de negocio

### Regla 1

Toda reseña pertenece a un `business`.

### Regla 2

Una reseña puede asociarse opcionalmente a una `campaign`.

### Regla 3

Si una reseña se asocia a campaña, esa campaña debe pertenecer al mismo negocio.

### Regla 4

No se debe depender de integraciones externas para operar el módulo.

### Regla 5

Marcar una reseña como respondida es una acción operativa válida aunque todavía no exista automatización ni publicación externa.

### Regla 6

Marcar una reseña como destacada la vuelve elegible para widgets o selección editorial simple.

### Regla 7

El contenido de la reseña debe preservarse como dato operativo.
No se edita como si fuera contenido propio.

### Regla 8

El inbox debe servir para operar volumen real moderado sin complejidad innecesaria.

### Regla 9

Tenancy y permisos siempre se resuelven en backend.

---

## 8. Edge cases

### Caso 1

Reseña sin texto, solo rating.

### Resolución

Debe permitirse.

---

### Caso 2

Reseña importada o cargada sin autor.

### Resolución

Debe permitirse con `authorDisplayName` opcional.

---

### Caso 3

Reseña marcada como respondida por error.

### Resolución

Debe poder corregirse cambiando estado o removiendo la marca de respuesta.

---

### Caso 4

Reseña asociada a campaña equivocada.

### Resolución

Debe poder corregirse manualmente.

---

### Caso 5

Import simple carga duplicados.

### Resolución

Aceptar controles mínimos.
No hace falta deduplicación sofisticada en esta etapa, pero sí conviene validar lo obvio si existe identificador o coincidencia fuerte.

---

### Caso 6

Reseña archivada sigue apareciendo en la vista principal.

### Resolución

La vista por defecto debería excluir `archived`.

---

## 9. Tests mínimos

### Unit

- validación de estados
- validación de campos mínimos
- helpers simples de filtros si existen

### Integration

- crear reseña dentro del negocio correcto
- impedir acceso cross-tenant
- listar solo reseñas del tenant
- filtrar por estado
- marcar destacada
- marcar respondida
- asociar campaña válida del mismo negocio
- bloquear campaña de otro negocio

### Contract

- `POST /reviews`
- `GET /reviews`
- `GET /reviews/:reviewId`
- `PATCH /reviews/:reviewId`
- `PATCH /reviews/:reviewId/status`
- `POST /reviews/:reviewId/highlight`
- `POST /reviews/:reviewId/mark-responded`

### E2E mínimo relacionado

- login
- entrar al negocio
- cargar reseña manual
- verla en inbox
- marcar destacada o respondida

---

## 10. Datos manuales permitidos

En este MVP está permitido cargar o corregir manualmente:

- texto de la reseña
- rating
- autor visible
- source
- fecha de reseña
- asociación a campaña
- estado
- destacada sí o no
- respondida sí o no

### Regla final

La operación manual no es un problema en esta etapa.
Es una decisión válida para validar pilotos reales sin construir una máquina innecesariamente compleja.
