# widgets.md

## 1. Propósito del módulo

El módulo `widgets` resuelve la capa de prueba social visible de Flikker OS.

Su objetivo es permitir que las reseñas destacadas del negocio puedan salir del inbox interno y mostrarse en propiedades públicas de forma simple, medible y controlada.

Este módulo existe para transformar reviews almacenadas en activos visibles que ayuden a:

- generar confianza
- reforzar reputación
- mejorar conversión
- mostrar prueba social real
- reutilizar testimonios sin hacerlo manualmente cada vez

En términos prácticos, `widgets` es el puente entre la reputación operada internamente y la reputación mostrada hacia afuera.

---

## 2. Qué representa un widget

Un `widget` es una configuración pública o semipública que define cómo exponer prueba social de un negocio.

Un widget puede representar, por ejemplo:

- carrusel de reseñas
- grilla de testimonios
- badge simple con rating promedio
- bloque de reviews destacadas
- lista compacta para sidebar
- embed sencillo para una landing o web del cliente

No representa una página completa ni un builder visual sofisticado.
Representa una unidad reutilizable de exposición de reputación.

---

## 3. Objetivo funcional

El objetivo del módulo es permitir que el negocio pueda:

- seleccionar qué reseñas mostrar
- definir un formato simple de visualización
- embeber esa prueba social en su web
- mantener consistencia básica con su branding
- activar o desactivar widgets
- medir impresiones e interacciones básicas

Sin este módulo, las reseñas sirven para operar internamente, pero no para convertirse fácilmente en prueba social visible.

---

## 4. Alcance del módulo

### Incluye

- creación de widgets
- configuración básica de widget
- asociación a business
- selección manual o semiautomática de reseñas
- activación / desactivación / archivo lógico
- estilos mínimos
- embed code o endpoint embebible
- render público controlado
- métricas básicas de impresiones/clicks
- orden de reseñas mostradas

### No incluye todavía

- builder visual complejo drag and drop
- personalización extrema pixel perfect
- CMS completo
- edición visual WYSIWYG avanzada
- segmentación dinámica sofisticada por audiencia
- experiments complejos
- landing builder completo
- CDN/edge optimization ultra avanzada como foco inicial

---

## 5. Rol del módulo dentro de la arquitectura

`widgets` consume principalmente datos de `reviews` y los expone hacia afuera de forma controlada.

Orden natural de dependencia:

1. auth
2. users
3. memberships
4. businesses
5. reviews
6. widgets
7. analytics
8. assets / branding

Este módulo tiene una parte privada de configuración y una parte pública de render.

---

## 6. Reglas de negocio principales

### Regla 1

Todo widget pertenece a un `business`.

### Regla 2

Un widget solo puede mostrar reviews del mismo business.

### Regla 3

Las reviews mostradas deben estar explícitamente aprobadas para exposición pública o cumplir una regla segura de selección.

### Regla 4

Un widget puede estar activo o inactivo, pero no se elimina físicamente en operación normal.

### Regla 5

Un widget archivado no debe seguir sirviéndose públicamente.

### Regla 6

Los endpoints públicos del widget no deben exponer datos internos innecesarios.

### Regla 7

La selección de reseñas debe ser controlada y no depender solo del frontend.

### Regla 8

Los estilos deben ser acotados y seguros; no convertir el widget en un mini framework visual.

### Regla 9

Los datos públicos servidos por un widget deben ser mínimos y sanitizados.

### Regla 10

Debe existir alguna forma de rotar, ordenar o destacar reseñas dentro del widget.

### Regla 11

Si un review deja de ser apto para exposición pública, el widget debe dejar de mostrarlo.

### Regla 12

La métrica de widgets debe derivarse de eventos de render/interacción y no de conteos manuales arbitrarios.

---

## 7. Casos de uso principales

### Caso de uso 1 — Crear widget

Un owner/admin crea un bloque embebible para mostrar testimonios.

### Caso de uso 2 — Seleccionar reviews destacadas

El operador elige qué reseñas aparecerán.

### Caso de uso 3 — Configurar estilo base

Se define variante simple, títulos, cantidad de items y branding mínimo.

### Caso de uso 4 — Activar widget

El widget pasa a estar disponible para embed público.

### Caso de uso 5 — Obtener código de embed

El negocio copia un snippet o usa una URL pública controlada.

### Caso de uso 6 — Medir impresiones

Se registran visualizaciones y quizá clics.

### Caso de uso 7 — Ocultar una reseña del widget

Una review ya no debe exponerse y se remueve o deja de salir.

---

## 8. Entidades del módulo

## 8.1 Widget

Entidad principal del módulo.

Campos sugeridos:

- `id`
- `businessId`
- `name`
- `slug`
- `status`
- `type`
- `title` (opcional)
- `subtitle` (opcional)
- `layoutVariant`
- `themeVariant` (opcional)
- `maxItems`
- `sortMode`
- `selectionMode`
- `showRating`
- `showAuthorName`
- `showSource`
- `showDate`
- `isPublic`
- `publicToken` o `publicKey`
- `embedVersion`
- `createdByUserId`
- `createdAt`
- `updatedAt`
- `archivedAt` (opcional)

### Explicación

- `type`: tipo conceptual del widget
- `layoutVariant`: variante visual acotada
- `selectionMode`: manual o automática
- `publicToken/publicKey`: identificador seguro para consumo público
- `isPublic`: si está disponible externamente

---

## 8.2 WidgetItem

Relación entre widget y reviews seleccionadas.

Campos sugeridos:

- `id`
- `widgetId`
- `reviewId`
- `position`
- `isPinned`
- `createdAt`

### Reglas

- una misma review puede aparecer en varios widgets del mismo business si tiene sentido
- `position` sirve para orden manual
- `isPinned` ayuda a fijar ciertos testimonios

---

## 8.3 WidgetThemeConfig

Opcional si se quiere separar configuración visual.

Campos sugeridos:

- `id`
- `widgetId`
- `primaryColor` (opcional)
- `secondaryColor` (opcional)
- `borderRadius` (opcional)
- `fontMode` (opcional)
- `showBranding`
- `customCssSafeMode` (idealmente false/no al inicio)
- `createdAt`
- `updatedAt`

### Nota

En MVP conviene que la personalización sea mínima para no explotar complejidad.

---

## 8.4 WidgetMetricEvent

Para impresiones e interacciones.

Campos sugeridos:

- `id`
- `widgetId`
- `eventType`
- `occurredAt`
- `pageUrl` (opcional)
- `referrer` (opcional)
- `reviewId` (opcional)
- `metadataJson` (opcional)

Valores sugeridos para `eventType`:

- `impression`
- `click`
- `expand`
- `cta_click`

### Nota

No hace falta abrir toda la complejidad analítica en la primera tanda, pero conviene pensar el shape.

---

## 9. Tipos de widget sugeridos

Campo `type` o `layoutVariant` con valores acotados al inicio:

- `carousel`
- `grid`
- `list`
- `badge`
- `single_featured`

### Explicación

- `carousel`: varias reseñas rotando
- `grid`: mosaico simple
- `list`: lista vertical
- `badge`: rating promedio o resumen corto
- `single_featured`: una reseña protagonista

---

## 10. Modos de selección de reviews

Campo `selectionMode`:

- `manual`
- `highlighted_auto`
- `recent_positive_auto`

### Recomendación

En MVP, priorizar:

- `manual`
- `highlighted_auto`

Eso reduce errores y simplifica control editorial.

---

## 11. Modelo de estados

Estados sugeridos para `widget.status`:

- `draft`
- `active`
- `inactive`
- `archived`

### Significado

#### `draft`

Widget creado, todavía no publicado externamente.

#### `active`

Disponible para render público.

#### `inactive`

Configurado pero temporalmente apagado.

#### `archived`

Fuera de operación normal, retenido por histórico.

### Reglas

- solo `active` debería servir render público normal
- `inactive` preserva configuración
- `archived` no debería exponerse ni editarse normalmente

---

## 12. Relaciones con otros módulos

### Con `businesses`

Todo widget pertenece a un business.

### Con `reviews`

Los widgets muestran reviews seleccionadas del mismo business.

### Con `branding` o perfil del negocio

Puede heredar colores o nombre visible.

### Con `analytics`

Los widgets generan eventos de impresiones/clicks.

### Con `assets`

A futuro puede conectarse con logos, imágenes o templates.

---

## 13. Diseño de tenancy

Este módulo mezcla una parte privada tenant-scoped y una parte pública controlada.

### Parte privada

- crear widget
- editar widget
- seleccionar reviews
- activar/desactivar
- ver métricas

Todo esto debe respetar tenancy estrictamente.

### Parte pública

- render del widget por token o clave pública
- solo expone contenido permitido
- no debe revelar datos internos del tenant

### Reglas

- no permitir asociar reviews de otro business
- el backend valida que todo `reviewId` del widget pertenezca al mismo business
- el endpoint público no devuelve metadata interna del negocio, usuarios o estados operativos
- no confiar en el frontend para controlar qué review se publica

---

## 14. Permisos sugeridos

### Platform Admin

Puede:

- ver todos los widgets
- auditar
- intervenir en casos especiales

### Business Owner

Puede:

- crear widgets
- editar
- activar/desactivar
- seleccionar reviews
- ver métricas

### Business Admin

Puede:

- crear
- editar
- activar/desactivar
- seleccionar reviews
- ver métricas

### Operator

Puede:

- ver widgets
- editar algunos campos si se permite
- proponer o gestionar selección de reviews
- no necesariamente tocar configuración más sensible

### Viewer

Puede:

- ver listado y detalle interno si aplica
- no crear ni editar

---

## 15. Campos mínimos para MVP

Para crear un widget en MVP, mínimo sugerido:

- `businessId`
- `name`
- `type`
- `selectionMode`
- `maxItems`

Campos opcionales:

- `title`
- `subtitle`
- `showRating`
- `showAuthorName`
- `showSource`

### Motivo

Permitir generar un widget simple rápido y hacerlo usable sin abrir demasiada configuración.

---

## 16. Validaciones de negocio

### `businessId`

- requerido
- debe existir
- debe ser accesible por el usuario

### `name`

- requerido
- trim automático
- longitud razonable

### `slug`

- opcional o derivado
- si existe, único dentro del business o global según diseño
- limpio para URL si se usa públicamente

### `type`

- enum válido

### `selectionMode`

- enum válido

### `maxItems`

- entero positivo
- rango acotado razonable

### `status`

- enum válido

### `reviewIds` asociados

- deben existir
- deben pertenecer al mismo business
- idealmente deben ser aptos para mostrarse públicamente

### `publicToken`

- generado backend
- no lo decide el frontend

---

## 17. Reglas de actualización

### Se puede actualizar

- nombre
- título/subtítulo
- estado
- layout
- cantidad máxima
- flags visuales
- items mostrados
- orden

### Debe cuidarse especialmente

- token público
- status activo/inactivo
- cambios de selección cuando el widget está en producción
- mostrar reviews no aprobadas o no destacadas si esa política existe

### Recomendación

- no permitir cambiar un widget a otro business
- si el widget ya está embebido, mantener estable el endpoint público
- si se cambia el set de reviews, que el cambio impacte sin romper el embed

---

## 18. Criterios para exponer una review en widget

Una review debería ser apta para widget si cumple alguna política como:

- `isHighlighted = true`
- rating alto y estado seguro
- no está oculta
- no está archivada
- no requiere atención
- no está marcada como inapropiada para exposición pública

### Recomendación MVP

Usar uno de estos dos enfoques:

1. selección manual explícita
2. solo reviews destacadas

Eso baja riesgo y mantiene control.

---

## 19. Endpoints sugeridos

## 19.1 Crear widget

`POST /widgets`

### Request ejemplo

```json
{
  "businessId": "bus_123",
  "name": "Testimonios homepage",
  "type": "carousel",
  "selectionMode": "manual",
  "maxItems": 6,
  "title": "Lo que dicen nuestros clientes"
}
```

### Response ejemplo

```json
{
  "businessId": "bus_123",
  "name": "Testimonios homepage",
  "type": "carousel",
  "selectionMode": "manual",
  "maxItems": 6,
  "title": "Lo que dicen nuestros clientes"
}
```

## 19.2 Listar widgets

**GET** `/widgets`

### Query params sugeridos

- `businessId`
- `status`
- `type`
- `search`
- `page`
- `limit`

---

## 19.3 Obtener widget por ID

**GET** `/widgets/:widgetId`

---

## 19.4 Actualizar widget

**PATCH** `/widgets/:widgetId`

---

## 19.5 Cambiar estado de widget

**PATCH** `/widgets/:widgetId/status`

### Uso

Mover entre `draft`, `active`, `inactive`, `archived`.

---

## 19.6 Reemplazar items del widget

**PUT** `/widgets/:widgetId/items`

### Request ejemplo

```json
{
  "reviewIds": ["rev_1", "rev_2", "rev_3"]
}
```

## Regla

Validar que todas las reviews sean del mismo business.

## 19.7 Agregar item al widget

**POST** `/widgets/:widgetId/items`

## 19.8 Quitar item del widget

**DELETE** `/widgets/:widgetId/items/:itemId`

## 19.9 Reordenar items

**POST** `/widgets/:widgetId/reorder`

## 19.10 Obtener código de embed

**GET** `/widgets/:widgetId/embed`

### Response posible

- `script snippet`
- `iframe snippet`
- `URL embebible simple`

### Recomendación MVP

Empezar con un embed simple y estable.

## 19.11 Render público del widget

**GET** `/public/widgets/:publicToken`

### Regla

Endpoint público, sin auth, solo con datos permitidos.

## 19.12 Registrar impresión o evento

**POST** `/public/widgets/:publicToken/events`

### Uso

Registrar `impression`, `click`, etc., si se decide instrumentar.

## 20. DTOs sugeridos

### `CreateWidgetDto`

- `businessId`
- `name`
- `type`
- `selectionMode`
- `maxItems`
- `title?`
- `subtitle?`
- `showRating?`
- `showAuthorName?`
- `showSource?`
- `showDate?`

### `UpdateWidgetDto`

- `name?`
- `title?`
- `subtitle?`
- `type?`
- `layoutVariant?`
- `selectionMode?`
- `maxItems?`
- `showRating?`
- `showAuthorName?`
- `showSource?`
- `showDate?`

### `UpdateWidgetStatusDto`

- `status`

### `ReplaceWidgetItemsDto`

- `reviewIds`

### `WidgetFiltersDto`

- `businessId`
- `status?`
- `type?`
- `search?`
- `page?`
- `limit?`

## 21. Payload público recomendado

El endpoint público no debería devolver todo el objeto interno del widget.

Solo lo necesario para render, por ejemplo:

- `title`
- `subtitle`
- `type`
- `layoutVariant`
- `items`
- `rating`
- `text`
- `authorName`
- `source`
- `date`

### No devolver públicamente

- IDs internos innecesarios
- flags internos de operación
- estados internos de reviews
- usuarios internos
- metadata sensible

## 22. Eventos internos posibles

- `widget.created`
- `widget.updated`
- `widget.activated`
- `widget.deactivated`
- `widget.archived`
- `widget.items_replaced`
- `widget.item_added`
- `widget.item_removed`
- `widget.embed_generated`
- `widget.public_rendered`
- `widget.clicked`

### Posibles usos

- activity log
- analytics
- métricas por negocio
- health score de cuenta

## 23. Auditoría

### Acciones que deberían auditarse

- creación de widget
- cambio de estado
- cambio de layout o configuración
- cambio de items seleccionados
- activación/desactivación
- regeneración de token público si alguna vez existe

### Campos útiles

- `actorUserId`
- `businessId`
- `widgetId`
- `action`
- `previousValue`
- `newValue`
- `timestamp`

## 24. Edge cases a contemplar

### Caso 1

Se intenta agregar una review de otro business.

### Solución

Validación estricta en backend.

### Caso 2

Una review usada en widget pasa a estar archivada o no apta.

### Solución

Excluirla del render público automáticamente o invalidarla en selección.

### Caso 3

Widget activo sin items.

### Solución

Permitir draft vacío, pero para `active` exigir mínimo razonable o render vacío controlado.

### Caso 4

Se rompe el sitio del cliente por embed frágil.

### Solución

Mantener embed simple, estable y desacoplado.

### Caso 5

Token público filtrado o compartido.

### Solución

Asumir que el token público sirve para lectura pública, no para escritura sensible. No exponer nada crítico detrás de él.

### Caso 6

Demasiadas opciones visuales vuelven caótico el módulo.

### Solución

Limitar `layoutVariants` y `theme options`.

### Caso 7

Métricas infladas por reloads o bots.

### Solución

Resolverlo luego en analytics/eventos, no sobrecomplicar el módulo base.

### Caso 8

Widget archivado sigue devolviendo contenido público.

### Solución

El endpoint público debe validar `status = active`.

## 25. Qué no hacer en este módulo

- no convertir widgets en page builder
- no meter custom CSS arbitrario al inicio
- no exponer estados internos de reviews
- no dejar selección pública controlada solo desde frontend
- no mezclar analytics compleja dentro del modelo principal
- no hacer hard delete normal
- no construir un sistema visual gigante antes de validar uso real

## 26. UI mínima necesaria

La UI debe ser operativa y corta.

### 1. Listado de widgets

Debe mostrar:

- nombre
- tipo
- estado
- cantidad de items
- acción de editar
- acción de ver embed

### 2. Formulario de creación

Debe pedir:

- nombre
- tipo
- modo de selección
- cantidad máxima
- título opcional

### 3. Detalle o configuración del widget

Debe permitir:

- activar o desactivar
- elegir reviews
- reordenar
- copiar embed
- previsualización simple

### 4. Selector de reviews

Debe permitir:

- elegir reviews destacadas o manuales
- ver extracto breve
- rating
- autor
- estado de aptitud si aplica

### Regla UI oficial

- nada de builder visual complejo
- nada de diseño sofisticado
- solo CRUD simple, selección de reviews y copia de embed

## 27. Datos demo sugeridos

### Ejemplo 1

- `name`: `Testimonios Home`
- `type`: `carousel`
- `status`: `active`
- `selectionMode`: `manual`
- `maxItems`: `6`

### Ejemplo 2

- `name`: `Badge reputación`
- `type`: `badge`
- `status`: `active`
- `selectionMode`: `highlighted_auto`
- `maxItems`: `1`

### Ejemplo 3

- `name`: `Opiniones destacadas landing`
- `type`: `grid`
- `status`: `draft`
- `selectionMode`: `manual`
- `maxItems`: `4`

## 28. Tests mínimos recomendados

### Unit tests

- validación de estados
- reglas de selección si existen helpers
- sanitización básica de payload público

### Integration tests

- crear widget dentro de business accesible
- impedir crear en business ajeno
- agregar solo reviews del mismo business
- cambiar estado correctamente
- obtener embed
- endpoint público devuelve solo datos permitidos
- widget inactivo o archivado no se expone públicamente

### Contract o API tests

- `POST /widgets`
- `GET /widgets`
- `GET /widgets/:id`
- `PATCH /widgets/:id`
- `PATCH /widgets/:id/status`
- `PUT /widgets/:id/items`
- `GET /widgets/:id/embed`
- `GET /public/widgets/:publicToken`

### E2E futuros

- login
- entrar al negocio
- crear widget
- seleccionar reviews
- activar
- copiar embed
- ver previsualización

## 29. Orden recomendado de implementación

1. schema Prisma de `Widget`
2. schema Prisma de `WidgetItem`
3. relación con `Business`
4. relación con `Review`
5. DTOs
6. service de CRUD y configuración
7. endpoint público de render
8. guards o policies privadas
9. tests de integración
10. UI mínima de listado y detalle
11. selector de reviews
12. embed snippet simple
13. métricas básicas si queda tiempo

## 30. Definición de done del módulo

El módulo `widgets` está suficientemente listo cuando:

- se puede crear widget
- se puede listar y editar
- se puede seleccionar reviews del mismo business
- se puede activar y desactivar
- existe un endpoint público controlado
- existe un embed simple
- no expone datos internos de más
- respeta tenancy en configuración privada
- tiene tests mínimos
- tiene UI mínima operativa

## 31. Recomendación técnica importante

Para el MVP, conviene priorizar una implementación simple como:

- configuración privada interna
- endpoint público JSON o render server-side simple
- snippet de embed estable

Antes que intentar resolver de entrada:

- personalización extrema
- múltiples frameworks host
- editor visual
- performance avanzada

Primero tiene que funcionar, ser seguro y ser fácil de instalar.

## 32. Resumen práctico

`widgets` es el módulo que convierte reseñas en prueba social visible.

La prioridad acá es:

- control editorial simple
- seguridad en exposición pública
- tenancy correcto en la parte privada
- embed estable
- configuración mínima útil
- UI simple sin sobreingeniería
