# responses.md

## 1. Objetivo

El módulo `responses` existe para registrar operación real sobre reseñas.

En esta etapa, su trabajo es simple:

- guardar el texto de una respuesta
- dejar constancia de quién respondió
- registrar cuándo se respondió
- marcar si una reseña quedó respondida o no

Este módulo no existe para vender magia de IA.
Existe para que el equipo pueda operar reseñas reales de forma ordenada.

---

## 2. Qué resuelve y qué no

### Qué resuelve en el MVP

- creación manual de una respuesta
- edición simple de una respuesta
- registro de autor de la respuesta
- registro de fecha de respuesta
- cambio de estado entre no respondida y respondida
- posibilidad opcional de usar un texto sugerido simple, si existe, sin volverlo eje del módulo

### Qué no resuelve ahora

- motor IA de respuestas
- versionado avanzado
- workflow de aprobar o publicar
- SLA
- alertas
- escalado automático
- policies complejas por rating o tono
- publicación externa automatizada

### Regla

Si una idea de producto convierte este módulo en un sistema editorial complejo, está fuera del alcance del MVP.

---

## 3. Modelo mínimo

El modelo debe ser lo bastante chico como para sostener operación real sin complejidad extra.

### 3.1 Response

Entidad principal del módulo.

Campos mínimos sugeridos:

- `id`
- `businessId`
- `reviewId`
- `content`
- `respondedByUserId`
- `respondedAt`
- `createdAt`
- `updatedAt`

### Notas

- `businessId` puede persistirse o derivarse desde la review según el diseño final
- `content` es el texto real usado o registrado
- `respondedByUserId` deja trazabilidad operativa mínima
- `respondedAt` marca el momento de respuesta

### 3.2 Estado operativo

No hace falta un workflow complejo.
Alcanza con un estado simple a nivel operativo:

- `not_responded`
- `responded`

Esto puede vivir:

- en `Review`
- como estado derivado desde existencia de `Response`

Lo importante es que el sistema pueda responder una pregunta simple:

**esta reseña ya fue respondida o no**

### 3.3 Texto sugerido simple opcional

Si se desea, puede existir una ayuda mínima como:

- texto base editable
- sugerencia simple no persistida

Pero no debe convertirse en motor central del módulo.

---

## 4. Reglas mínimas

### Regla 1

Toda response pertenece a una `review`.

### Regla 2

Una response no puede existir para una review de otro negocio.

### Regla 3

La operación principal es registrar respuesta real, no una propuesta editorial.

### Regla 4

Si se guarda una response, la reseña asociada debe poder considerarse respondida.

### Regla 5

Debe poder saberse quién respondió y cuándo.

### Regla 6

No hace falta publicar automáticamente nada en plataformas externas para validar este módulo.

### Regla 7

No hace falta soporte para múltiples aprobaciones, múltiples versiones ni historial sofisticado en esta etapa.

### Regla 8

Permisos y tenancy se validan siempre en backend.

---

## 5. Endpoints mínimos

Los endpoints deben alcanzar para registrar y consultar la operación básica.

### Privados

- `POST /responses`
  Crear respuesta manual para una review.

- `GET /reviews/:reviewId/response`
  Obtener la respuesta asociada si existe.

- `PATCH /responses/:responseId`
  Editar respuesta existente.

- `POST /reviews/:reviewId/mark-responded`
  Marcar reseña como respondida si el sistema permite esa acción incluso sin texto persistido.

- `POST /reviews/:reviewId/mark-not-responded`
  Revertir el estado si se marcó por error.

### Regla

No abrir endpoints de:

- generate con IA
- request approval
- approve
- publish
- discard
- mark final

Todo eso queda fuera del MVP.

---

## 6. UI mínima

La UI debe vivir pegada a la reseña, no como un sistema separado complejo.

### Pantallas o bloques mínimos

#### 1. Sección de respuesta dentro del detalle de review

Debe permitir:

- ver si la reseña está respondida o no
- ver el texto de respuesta si existe
- ver quién respondió
- ver cuándo respondió

#### 2. Editor simple

Debe permitir:

- escribir respuesta
- editarla
- guardar

#### 3. Acción rápida

Debe permitir:

- marcar respondida
- marcar no respondida si se necesita corregir

### Regla UI

No construir un composer complejo.
No construir un flujo editorial.
No construir un centro de IA.

La UI debe resolver operación real con el menor costo posible.

---

## 7. Tests mínimos

### Unit

- validación de campos mínimos
- regla simple de estado respondida o no respondida

### Integration

- crear response sobre review del tenant correcto
- impedir crear response sobre review ajena
- editar response
- marcar review como respondida
- revertir marca si aplica
- persistir `respondedByUserId` y `respondedAt`

### Contract

- `POST /responses`
- `GET /reviews/:reviewId/response`
- `PATCH /responses/:responseId`
- `POST /reviews/:reviewId/mark-responded`

### E2E mínimo relacionado

- login
- entrar al negocio
- abrir reseña
- guardar respuesta
- ver reseña marcada como respondida

---

## 8. Qué se congela explícitamente

Queda congelado por ahora:

- motor IA
- prompts complejos
- versionado avanzado
- approvals
- publish workflow
- SLA
- alertas
- escalado automático
- policies por tono o score
- métricas avanzadas de tiempo de respuesta
- historial editorial sofisticado

### Regla final

`responses` en este MVP no es una promesa de automatización inteligente.
Es una capa simple para registrar que una reseña fue respondida, con texto, autor y fecha.
