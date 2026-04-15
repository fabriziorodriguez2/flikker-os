# widgets.md

## 1. Objetivo

El módulo `widgets` existe para convertir reseñas operadas internamente en prueba social visible y vendible.

En el MVP, el widget ya es producto.
Tiene que poder mostrarse, embederse y medirse de forma básica.

Pero no tiene que convertirse todavía en un engine completo de layouts, personalización y automatización.

Su objetivo real en esta etapa es:

- tomar reseñas aptas para mostrar
- exponerlas con un formato simple
- permitir embed fácil en una web
- registrar impresiones y clicks básicos

---

## 2. Widgets soportados en MVP

### Widgets que sí entran

#### 1. Badge rating

Uso:

- mostrar rating o reputación resumida
- servir como pieza liviana para sitios o landings

#### 2. Review list / grid

Uso:

- mostrar varias reseñas destacadas
- servir como bloque simple de prueba social

### Widgets opcionales solo si no ralentizan

#### 3. Testimonial hero

Puede entrar solo si reutiliza casi toda la infraestructura ya hecha.

#### 4. Carousel

Puede entrar solo si no obliga a abrir demasiada complejidad de UI, configuración o render.

### Regla

Si `hero` o `carousel` ralentizan la salida del MVP, se postergan.

---

## 3. Entidades mínimas

El modelo debe ser chico y orientado a publicación real.

### 3.1 Widget

Entidad principal.

Campos mínimos sugeridos:

- `id`
- `businessId`
- `name`
- `status`
- `type`
- `publicToken`
- `title` opcional
- `maxItems` opcional
- `showRating`
- `showAuthorName`
- `showSource`
- `createdAt`
- `updatedAt`

### Tipos mínimos válidos

- `badge`
- `review_list`
- `review_grid`

### Tipos opcionales si no ralentizan

- `testimonial_hero`
- `carousel`

### Estados mínimos válidos

- `draft`
- `active`
- `inactive`

---

### 3.2 WidgetItem

Sirve para seleccionar reseñas concretas cuando la selección sea manual.

Campos mínimos sugeridos:

- `id`
- `widgetId`
- `reviewId`
- `position`
- `createdAt`

### Alternativa aceptable

Si simplifica el MVP, el widget puede alimentarse desde:

- selección manual de `widget_items`
- reseñas marcadas como destacadas

No hace falta resolver automatización compleja de selección en esta etapa.

---

## 4. Configuración mínima permitida

La configuración debe ser lo bastante chica como para no abrir un mini builder.

### Permitido

- nombre interno del widget
- tipo
- título opcional
- cantidad máxima de ítems
- mostrar o no rating
- mostrar o no autor
- mostrar o no fuente
- estado `draft/active/inactive`

### Opcional si no complica

- subtítulo simple
- orden manual básico

### No permitido por ahora

- decenas de layouts
- custom CSS libre
- branding visual avanzado
- reglas complejas de selección automática
- personalización pixel perfect

### Regla

La configuración existe para publicar más rápido, no para abrir una superficie infinita de opciones.

---

## 5. Flujo de publicación

El flujo del módulo debe ser corto y entendible.

1. usuario entra al negocio activo
2. crea widget
3. elige tipo de widget
4. selecciona reseñas destacadas o define `widget_items`
5. ajusta configuración mínima
6. activa widget
7. obtiene script o iframe de embed
8. publica el embed en sitio del cliente
9. el sistema registra impresiones y clicks básicos

### Regla

Publicar un widget no debe requerir diseño complejo ni configuración extensa.

---

## 6. Eventos y métricas

No hace falta una analítica sofisticada.
Sí hace falta saber si el widget se está usando.

### Eventos mínimos a registrar

- `widget.created`
- `widget.updated`
- `widget.activated`
- `widget.inactivated`
- `widget.public_rendered`
- `widget.clicked`

### Métricas mínimas útiles

- cantidad de widgets activos
- impresiones por widget
- clicks por widget
- fecha de último render

### Regla

No construir ahora:

- funnel completo
- analítica por dispositivo compleja
- atribución avanzada
- cohortes
- mapas de interacción

Con impresiones y clicks básicos alcanza para validar valor.

---

## 7. Endpoints mínimos

### Privados

- `POST /widgets`
  Crear widget.

- `GET /widgets`
  Listar widgets del negocio activo.

- `GET /widgets/:widgetId`
  Obtener detalle.

- `PATCH /widgets/:widgetId`
  Editar configuración mínima.

- `PATCH /widgets/:widgetId/status`
  Activar o inactivar.

- `PUT /widgets/:widgetId/items`
  Reemplazar selección manual de reseñas si se usa `widget_item`.

- `GET /widgets/:widgetId/embed`
  Obtener script o iframe de embed.

- `GET /widgets/:widgetId/metrics`
  Obtener impresiones y clicks básicos.

### Públicos

- `GET /public/widgets/:publicToken`
  Entregar widget embebible o payload público controlado.

- `POST /public/widgets/:publicToken/events`
  Registrar impresión o click si se decide separar este registro.

### Regla

Los endpoints públicos deben tener rate limiting y exponer solo datos permitidos.

---

## 8. UI mínima

La UI debe ser operativa y vendible, no exuberante.

### Pantallas mínimas

#### 1. Listado de widgets

Debe mostrar:

- nombre
- tipo
- estado
- cantidad de ítems si aplica
- acceso a embed

#### 2. Formulario de creación

Debe pedir:

- nombre
- tipo
- título opcional
- cantidad máxima

#### 3. Detalle o configuración

Debe permitir:

- activar o inactivar
- elegir reseñas
- editar configuración mínima
- copiar embed
- ver preview simple si existe

### Regla UI

No construir un builder visual.
No construir una superficie enorme de edición.
El objetivo es sacar el widget rápido y hacerlo usable.

---

## 9. Edge cases

### Caso 1

Widget activo sin reseñas aptas para mostrar.

### Resolución

Permitir `draft` vacío.
Si está `active`, render vacío controlado o validación mínima antes de activar.

---

### Caso 2

Se intenta mostrar una reseña de otro negocio.

### Resolución

Validación estricta en backend.

---

### Caso 3

Una reseña destacada deja de ser apta para exposición.

### Resolución

Debe poder salir del widget por selección manual o por validación de elegibilidad.

---

### Caso 4

El embed rompe el sitio del cliente.

### Resolución

Priorizar iframe o script simple y estable.
No intentar resolver integraciones host complejas en esta etapa.

---

### Caso 5

Clicks o impresiones inflados por recargas.

### Resolución

Aceptar métrica básica de MVP.
No sobrediseñar anti-fraude todavía.

---

### Caso 6

Un widget inactivo sigue expuesto públicamente.

### Resolución

El endpoint público debe validar `status = active`.

---

## 10. Fuera de alcance

Queda fuera por ahora:

- builder complejo
- decenas de layouts
- personalización excesiva
- automatización avanzada de selección
- custom CSS arbitrario
- theming complejo
- editores visuales
- animaciones sofisticadas
- analítica avanzada de widget
- optimización avanzada multi-framework

### Regla final

En este MVP, `widgets` ya es producto vendible.
Pero todavía no tiene que ser un engine completo.

Tiene que hacer bien tres cosas:

- mostrar prueba social
- embeberse fácil
- medir uso básico
