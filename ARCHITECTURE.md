# ARCHITECTURE.md

## 1. Propósito de este documento

Este documento fija la arquitectura oficial del MVP recortado de Flikker.

No describe el producto completo ideal.
Describe la versión que queremos construir y validar ahora, con el menor costo de complejidad posible.

El objetivo es evitar dos errores:

- subestimar seguridad y tenancy
- sobreconstruir infraestructura, módulos y flujos antes de validar el uso real

Este archivo define:

- principios de arquitectura del MVP
- stack elegido y por qué
- infraestructura mínima necesaria hoy
- infraestructura explícitamente pospuesta
- dominios activos y dominios congelados
- modelo de tenancy
- decisiones mínimas de datos
- eventos mínimos a registrar
- slice principal end-to-end
- seguridad mínima no negociable
- testing mínimo obligatorio
- qué no construir todavía

---

## 2. Qué estamos construyendo ahora

Flikker MVP no es una plataforma completa de reputación local.

En esta etapa estamos construyendo un sistema multi-tenant simple para validar este flujo:

`negocio activo -> campaña o QR trazable -> evento -> reseña cargada manualmente -> reseña destacada o respondida -> widget embebido -> métricas mínimas`

Todo lo que no ayude a operar, mostrar o medir ese flujo queda fuera o congelado temporalmente.

---

## 3. Principios de arquitectura del MVP

### Principio 1

El MVP se diseña para validar un flujo real, no para anticipar todo el roadmap.

### Principio 2

Multi-tenancy y permisos se resuelven bien desde el día uno.
Eso no se negocia.

### Principio 3

La infraestructura debe ser la mínima necesaria para que el flujo funcione de punta a punta.

### Principio 4

Si algo puede hacerse manual sin romper el valor del MVP, se hace manual.

Ejemplos aceptables en esta etapa:

- carga manual de reseñas
- marcado manual de reseña respondida
- selección manual de reseñas para widget
- activación manual de campañas
- revisión manual de métricas mínimas

### Principio 5

Frontend mínimo, backend claro.

La prioridad está en:

- modelo de datos
- tenancy
- validaciones
- contratos API
- flujo usable

### Principio 6

No se agregan servicios, capas ni tablas "por si luego hacen falta" sin una necesidad concreta del MVP.

### Principio 7

Cada módulo activo debe cerrar un slice usable de negocio.

No queremos piezas aisladas.
Queremos pasos operables del flujo principal.

---

## 4. Stack elegido y por qué

### Frontend

- Next.js
- TypeScript
- App Router
- Tailwind CSS

### Backend

- NestJS
- TypeScript

### Base de datos

- PostgreSQL

### ORM

- Prisma

### Testing

- unit tests en TypeScript
- integration y contract tests en API
- E2E mínimo del flujo principal

### Por qué este stack se mantiene

- permite velocidad razonable sin inventar base nueva
- ya está alineado con la estructura del repo
- soporta bien un backend modular
- permite multi-tenancy con control fuerte desde API
- evita reabrir discusiones de stack mientras recortamos alcance

### Qué significa "frontend web moderno" en este MVP

No significa frontend sofisticado.
Significa una app web actual, mantenible y suficientemente clara para operar:

- login
- selección de negocio activo
- campañas
- reseñas
- respuestas mínimas
- widgets
- métricas básicas

---

## 5. Infraestructura que sí es necesaria ahora

Necesaria para esta versión:

- aplicación web
- API backend
- PostgreSQL
- variables de entorno por entorno
- logging estructurado básico
- manejo razonable de errores
- migraciones de base de datos
- generación de QR como imagen o valor descargable desde la app o API

### Observabilidad mínima útil

- logs en backend
- errores visibles en desarrollo
- trazabilidad básica de requests críticas
- health endpoint en API

### Deploy

Puede ser simple.
No hace falta una arquitectura distribuida para este MVP.

### Assets

No hace falta storage dedicado como prerequisito.
Si el QR puede generarse bajo demanda o persistirse de forma simple, alcanza.

---

## 6. Infraestructura que se pospone

No es prerequisito del MVP:

- Redis
- BullMQ u otra cola
- S3 o storage general dedicado
- Cloudinary como dependencia obligatoria
- workers separados
- event bus
- webhooks complejos
- cron jobs no esenciales
- CDN especializada
- replicación compleja
- búsqueda avanzada
- pipeline de analítica separado
- observabilidad enterprise
- feature flags complejos

### Regla

Nada de esto entra como dependencia base salvo que el flujo principal quede bloqueado sin ello.

Hoy no está bloqueado.

---

## 7. Dominios activos del MVP

Los únicos dominios activos de producto para esta etapa son:

### 7.1 Auth y Access

Incluye:

- login
- sesión
- memberships
- roles
- negocio activo

### 7.2 Businesses

Incluye:

- negocio como tenant principal
- datos mínimos del negocio
- estado operativo simple

### 7.3 Campaigns

Incluye:

- campañas trazables
- QR o link asociado
- estado simple
- relación con negocio

### 7.4 Event Tracking mínimo

Incluye:

- registro de scan
- registro de click o redirect
- atribución básica a campaña o QR

### 7.5 Reviews

Incluye:

- carga manual
- listado
- detalle
- estado operativo simple
- marcado como destacada
- relación opcional con campaign

### 7.6 Responses mínimas

Incluye:

- respuesta manual
- edición simple
- marcado de reseña como respondida o con respuesta asociada

No incluye workflow editorial complejo.

### 7.7 Widgets

Incluye:

- widget embebible simple
- selección manual o desde reseñas destacadas
- endpoint público controlado

### 7.8 Analytics mínimas

Incluye solo métricas básicas para validar uso:

- cantidad de campañas
- scans o clicks por campaña
- cantidad de reseñas cargadas
- cantidad de reseñas destacadas
- cantidad de widgets activos
- impresiones básicas de widget si se instrumentan

---

## 8. Dominios congelados

Estos dominios no se construyen ahora, aunque puedan existir más adelante:

- IA avanzada de respuestas
- plantillas complejas de responses
- aprobaciones multietapa
- content studio
- assets de marketing
- client success
- onboarding interno complejo
- notifications complejas
- billing
- planes y límites comerciales
- analytics avanzadas
- health score
- automatizaciones complejas
- CRM
- inbox omnicanal
- social integrations grandes
- app móvil

### Regla

Si una decisión de arquitectura favorece a uno de estos dominios pero complica el MVP, se rechaza.

---

## 9. Estructura del repositorio

Se mantiene la estructura general del monorepo:

```txt
flikker-os/
├─ apps/
│  ├─ web/
│  └─ api/
├─ packages/
│  ├─ ui/
│  ├─ config/
│  └─ types/
├─ docs/
│  ├─ modules/
│  ├─ adr/
│  └─ runbooks/
├─ ARCHITECTURE.md
├─ PRODUCT_SCOPE.md
├─ CLAUDE.md
└─ README.md
```

### apps/web

Responsable de:

- login
- navegación interna
- formularios y listados mínimos
- pantallas operativas del MVP
- vista simple de widgets y métricas

### apps/api

Responsable de:

- auth
- tenancy
- permisos
- módulos de dominio
- generación y resolución de QR o links trazables
- endpoints públicos y privados

---

## 10. Organización por dominios

Dentro de `apps/api/src/modules`, el backend debe enfocarse en pocos dominios:

- auth
- memberships
- businesses
- campaigns
- tracking o events
- reviews
- responses
- widgets
- common

### Regla

No abrir módulos vacíos para futuros congelados.

Ejemplos de módulos que no deberían existir todavía:

- billing
- onboarding
- assets
- content
- analytics avanzada
- notifications complejas

---

## 11. Modelo de tenancy

Multi-tenant desde el día uno sigue siendo obligatorio.

### Unidad principal de tenancy

El tenant operativo principal es `business`.

### Modelo mínimo

- `users`
- `businesses`
- `memberships`

### Regla principal

Toda entidad de negocio relevante debe quedar asociada a un `businessId` o derivarse inequívocamente de una entidad que ya lo tenga.

### Entidades que deben quedar scopeadas

- campaigns
- tracking events
- reviews
- responses
- widgets

### Reglas no negociables

1. Nunca confiar en filtros del frontend.
2. Todo endpoint privado valida acceso al business actual.
3. Los roles viven y se verifican en backend.
4. Un usuario puede pertenecer a varios negocios.
5. El usuario opera siempre sobre un negocio activo.
6. Ningún recurso de un business puede quedar visible o editable desde otro.

### Roles mínimos

- owner
- admin
- operator
- viewer

No abrir permisos ultra granulares todavía.

---

## 12. Decisiones de datos mínimas

La base de datos debe modelar solo lo necesario para el flujo principal.

### Orden recomendado de modelado

1. users
2. sessions o refresh tokens
3. businesses
4. memberships
5. campaigns
6. campaign targets o qr references simples
7. tracking events
8. reviews
9. responses
10. widgets
11. widget items

### Entidades mínimas esperadas

#### Business

Campos mínimos:

- id
- name
- slug
- status
- createdAt
- updatedAt

#### Membership

Campos mínimos:

- id
- userId
- businessId
- role
- status

#### Campaign

Campos mínimos:

- id
- businessId
- name
- channel
- status
- targetUrl o targetType
- createdAt
- updatedAt

#### TrackingEvent

Campos mínimos:

- id
- businessId
- campaignId
- eventType
- occurredAt
- metadata básica

#### Review

Campos mínimos:

- id
- businessId
- campaignId opcional
- source
- rating
- content opcional
- authorDisplayName opcional
- reviewedAt
- status
- isHighlighted
- createdAt
- updatedAt

#### Response

Campos mínimos:

- id
- reviewId
- businessId
- content
- status
- createdByUserId opcional
- createdAt
- updatedAt

### Nota

No hace falta modelar ahora:

- versiones complejas
- plantillas
- policies
- snapshots ricos
- tags sofisticados
- tablas agregadas de analytics

#### Widget

Campos mínimos:

- id
- businessId
- name
- status
- type
- selectionMode
- publicToken
- createdAt
- updatedAt

#### WidgetItem

Campos mínimos:

- id
- widgetId
- reviewId
- position

### Regla de modelado

Si un campo no aporta a operar hoy el flujo central, no entra todavía.

---

## 13. Eventos mínimos a registrar

No hace falta un event bus.
Hace falta registrar eventos simples y útiles.

### Eventos mínimos recomendados

- `auth.login_succeeded`
- `auth.business_switched`
- `campaign.created`
- `campaign.activated`
- `tracking.scan_recorded`
- `tracking.redirect_recorded`
- `review.created_manual`
- `review.highlighted`
- `review.unhighlighted`
- `response.created`
- `response.updated`
- `response.marked_done` o equivalente simple
- `widget.created`
- `widget.activated`
- `widget.public_rendered`

### Cómo registrarlos ahora

Puede resolverse de forma simple:

- logs estructurados
- tabla de eventos básicos
- activity log mínimo

No hace falta infraestructura asíncrona para esto.

---

## 14. Slice end-to-end principal

El slice principal que esta arquitectura debe soportar sin atajos rotos es:

1. usuario inicia sesión
2. selecciona negocio activo
3. crea campaña
4. genera QR o link trazable
5. sistema registra evento público cuando se usa ese acceso
6. operador carga manualmente una reseña
7. operador marca reseña como destacada o agrega respuesta simple
8. crea widget
9. selecciona reseñas
10. activa widget
11. consume embed o endpoint público
12. consulta métricas mínimas del flujo

### Regla

Toda decisión de arquitectura debe justificarse contra este slice.

Si no mejora este flujo, probablemente sobra en esta etapa.

---

## 15. Endpoints públicos que requieren rate limiting

Aunque el MVP sea simple, los endpoints públicos no pueden quedar abiertos sin protección.

### Requieren rate limiting

- endpoint público de redirect o tracking de campañas o QR
- endpoint público de render de widget
- endpoint público de eventos de widget, si existe
- login
- refresh token
- forgot password, si se implementa ahora

### Requieren además validación cuidadosa

- cualquier endpoint que acepte `publicToken`
- cualquier endpoint que dispare redirects
- cualquier endpoint público que registre eventos

### No asumir

No asumir que por ser MVP habrá poco tráfico o poco abuso.

---

## 16. Seguridad mínima no negociable

Obligatoria desde el inicio:

- RBAC en backend
- tenant scoping en backend
- validación de DTOs
- sanitización razonable del contenido público
- rate limiting en endpoints públicos críticos
- secrets por entorno
- tokens y passwords hasheados correctamente
- control de acceso a widgets privados
- no exposición de metadata interna en endpoints públicos

### Regla clave

La seguridad de tenancy no puede depender del frontend.

### En widgets públicos

Solo exponer:

- texto permitido
- rating si corresponde
- autor visible si corresponde
- source si corresponde

Nunca exponer:

- businessId interno innecesario
- estados internos de review
- usuarios internos
- metadata operativa

---

## 17. Contrato entre frontend y backend

El frontend consume API explícita.

### El backend debe proveer

- DTOs claros
- validaciones
- errores consistentes
- contratos simples
- respuestas preparadas para uso real

### El frontend debe resolver

- formularios simples
- tablas simples
- feedback de loading y error
- navegación clara

### El frontend no debe resolver

- tenancy
- permisos
- validaciones críticas de negocio
- selección pública segura de widgets
- reglas de acceso cross-tenant

---

## 18. Testing mínimo obligatorio

No hace falta cobertura enorme.
Sí hace falta cubrir el flujo principal y los riesgos reales.

### Unit tests

Para:

- validaciones puras
- helpers de permisos
- reglas simples de transición de estado

### Integration tests

Para:

- auth y switch business
- creación de campaña dentro del tenant correcto
- registro de tracking event
- carga manual de review
- creación de response sobre review accesible
- creación de widget con reviews del mismo business
- bloqueo de acceso cross-tenant

### Contract tests

Para endpoints críticos:

- login
- campaigns
- reviews
- responses mínimas
- widgets privados
- widget público

### E2E mínimo obligatorio

El E2E mínimo del MVP debe cubrir:

1. login
2. selección de negocio activo
3. creación de campaña
4. generación de QR o link
5. registro de evento público
6. carga manual de reseña
7. destacado o respuesta simple
8. creación y activación de widget
9. visualización de widget público

Si este E2E no funciona, el MVP todavía no está bien cerrado.

---

## 19. Qué no construir todavía

No construir todavía:

- colas
- workers
- event bus
- Redis
- almacenamiento dedicado para assets como prerequisito
- builder visual de widgets
- múltiples variantes visuales complejas
- IA avanzada de responses
- sistema de plantillas amplio
- aprobaciones complejas
- publicación automática a plataformas externas
- analytics con snapshots agregados complejos
- health score
- billing
- client success
- onboarding interno complejo
- módulos vacíos para futuros
- dashboards elaborados sin datos confiables
- over-modeling de estados y entidades

### Regla operativa

Si se puede resolver manualmente y sigue validando el valor del MVP, se elige la opción manual.

---

## 20. Resumen ejecutivo

La arquitectura del MVP de Flikker debe ser:

- multi-tenant
- modular
- relacional
- segura
- pequeña
- operable de punta a punta

No estamos optimizando para amplitud de producto.
Estamos optimizando para validar un flujo de negocio concreto sin hipotecar el repo con complejidad prematura.

---

## 21. Decisiones congeladas por 6 a 8 semanas

- No introducir Redis.
- No introducir BullMQ ni colas.
- No introducir S3 o Cloudinary como dependencia obligatoria del MVP.
- No abrir dominios de billing, content studio, client success o health score.
- No construir IA avanzada de responses.
- No construir workflows de aprobación complejos.
- No construir analítica avanzada ni tablas agregadas prematuras.
- No convertir widgets en builder visual.
- No introducir event bus ni arquitectura orientada a eventos.
- No abrir más infraestructura de deploy que web, API y PostgreSQL.
- No abrir permisos ultra granulares.
- No modelar entidades futuras que no participen en el slice principal.
