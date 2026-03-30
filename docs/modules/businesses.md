# businesses.md

## 1. Propósito del módulo

El módulo `businesses` representa la cuenta cliente principal dentro de Flikker OS.

Es la base organizativa sobre la que vive casi todo el sistema.  
Antes de campañas, reseñas, widgets o analytics, tiene que existir un negocio correctamente definido.

Este módulo resuelve:

- creación de negocios
- edición de datos base del negocio
- configuración operativa inicial
- relación con sucursales
- relación con memberships
- branding y datos visibles
- estado general de la cuenta

En términos prácticos, un `business` es el tenant operativo principal del sistema.

---

## 2. Qué representa un business

Un `business` no es solo “una empresa” en sentido abstracto.

Dentro del producto, un `business` representa la unidad de operación sobre la que se controla:

- acceso
- configuración
- sucursales
- campañas
- reseñas
- respuestas
- widgets
- assets
- analítica
- billing

Casi toda entidad relevante del sistema debería terminar asociada, directa o indirectamente, a un `business`.

---

## 3. Objetivo funcional

El objetivo del módulo es permitir que Flikker OS pueda:

- dar de alta una cuenta cliente
- administrarla de forma segura
- usarla como scope de tenancy
- centralizar su identidad base
- conectar el resto de módulos a esa cuenta

Sin este módulo bien definido, no existe separación real entre clientes.

---

## 4. Alcance del módulo

### Incluye

- alta de negocio
- lectura de negocio
- actualización de negocio
- activación / desactivación lógica
- branding básico
- preferencias base
- metadata operativa
- relación con branches
- relación con memberships
- validación de ownership / acceso

### No incluye todavía

- billing complejo
- contratos comerciales
- CRM del cliente
- gestión contable
- reporting avanzado
- múltiples marcas por business
- franquicias complejas
- multi-país complejo
- onboarding automatizado muy sofisticado

---

## 5. Rol del módulo dentro de la arquitectura

`businesses` es uno de los módulos núcleo del sistema.

Orden real de dependencia:

1. auth
2. users
3. memberships
4. businesses
5. branches
6. campaigns
7. reviews
8. responses
9. widgets
10. analytics

Eso significa que este módulo debe ser estable, entendible y muy bien protegido.

---

## 6. Reglas de negocio principales

### Regla 1

Todo recurso del negocio debe pertenecer a un `business`.

### Regla 2

Un usuario no obtiene acceso a un business por conocer su ID; el acceso siempre se valida por membership y rol.

### Regla 3

La lectura y modificación de un business siempre debe estar scopeada por tenancy.

### Regla 4

Un business puede tener una o más sucursales, pero puede arrancar con una sola o incluso sin sucursales cargadas todavía si el onboarding se hace por etapas.

### Regla 5

Un business puede tener varios usuarios asociados mediante memberships.

### Regla 6

Un business debe poder desactivarse lógicamente sin eliminar sus datos históricos.

### Regla 7

El slug del negocio debe ser estable y único si se usa públicamente.

### Regla 8

El estado del business debe poder bloquear operación sensible si la cuenta está suspendida, archivada o impaga en el futuro.

### Regla 9

Nunca se debe eliminar físicamente un business en una operación normal de producto.

### Regla 10

Los cambios importantes de configuración deben quedar auditados.

---

## 7. Casos de uso principales

### Caso de uso 1 — Crear negocio

Un owner o admin de plataforma crea un negocio nuevo con nombre y configuración mínima.

### Caso de uso 2 — Ver perfil del negocio

Un usuario con acceso consulta datos base de su cuenta.

### Caso de uso 3 — Editar negocio

Un owner/admin actualiza branding, datos comerciales o configuraciones básicas.

### Caso de uso 4 — Listar negocios accesibles

Un usuario consulta los negocios a los que pertenece.

### Caso de uso 5 — Cambiar contexto activo

Un usuario con acceso a múltiples negocios elige cuál está operando.

### Caso de uso 6 — Desactivar negocio

Un admin de plataforma o flujo interno marca el negocio como inactivo.

### Caso de uso 7 — Inicializar negocio para onboarding

Se crea la estructura mínima para que luego se carguen branches, campañas, widgets, etc.

---

## 8. Entidades del módulo

## 8.1 Business

Entidad principal del módulo.

Campos sugeridos:

- `id`
- `name`
- `legalName` (opcional)
- `slug`
- `status`
- `industry`
- `description`
- `websiteUrl`
- `phone`
- `email`
- `country`
- `timezone`
- `currency`
- `logoUrl` (opcional)
- `primaryColor` (opcional)
- `secondaryColor` (opcional)
- `addressLine1` (opcional)
- `addressLine2` (opcional)
- `city` (opcional)
- `state` (opcional)
- `postalCode` (opcional)
- `googleBusinessProfileUrl` (opcional)
- `defaultReviewRedirectUrl` (opcional)
- `isActive`
- `createdAt`
- `updatedAt`
- `archivedAt` (opcional)

### Notas

- `slug` debe ser único
- `status` no debe depender solo de `isActive`
- conviene usar ambos: `status` para semántica y `isActive` para chequeo rápido si hace falta

---

## 8.2 BusinessSettings

Si se decide separar configuración operativa del perfil base.

Campos sugeridos:

- `id`
- `businessId`
- `defaultLocale`
- `defaultTone`
- `autoEscalateLowRating`
- `lowRatingThreshold`
- `notifyOnNewReview`
- `notifyOnNegativeReview`
- `widgetDefaultEnabled`
- `createdAt`
- `updatedAt`

### Nota

Esto puede arrancar embebido en `Business` y extraerse después si crece demasiado.

---

## 8.3 BusinessBrandProfile

Opcional como entidad separada si branding crece.

Campos sugeridos:

- `id`
- `businessId`
- `publicDisplayName`
- `shortBio`
- `logoAssetId`
- `coverAssetId`
- `primaryColor`
- `secondaryColor`
- `fontPreference` (opcional)
- `toneOfVoice` (opcional)
- `createdAt`
- `updatedAt`

### Nota

En MVP puede convivir dentro de `Business` para no fragmentar demasiado.

---

## 9. Modelo de estados

Estados sugeridos para `business.status`:

- `draft`
- `active`
- `inactive`
- `suspended`
- `archived`

### Significado

#### `draft`

Negocio creado pero todavía incompleto o en onboarding inicial.

#### `active`

Negocio plenamente operativo.

#### `inactive`

Negocio pausado sin operación activa, pero no necesariamente penalizado.

#### `suspended`

Negocio temporalmente bloqueado por razones operativas o futuras razones de billing/compliance.

#### `archived`

Negocio fuera de operación normal, retenido solo para histórico.

### Reglas

- `archived` no debería aceptar nuevas campañas activas ni cambios operativos normales
- `suspended` puede limitar operaciones críticas
- `draft` puede tener campos faltantes
- `active` debe cumplir mínimos de configuración

---

## 10. Relaciones con otros módulos

### Con `users`

Un business se relaciona con usuarios a través de memberships.

### Con `memberships`

`memberships` define qué usuario pertenece a qué business y con qué rol.

### Con `branches`

Un business puede tener muchas sucursales.

### Con `campaigns`

Cada campaña pertenece a un business y opcionalmente a una branch.

### Con `reviews`

Cada review debe estar asociada a un business, de forma directa o indirecta según diseño final.

### Con `responses`

Las respuestas viven bajo el contexto del business.

### Con `widgets`

Los widgets son configurados por negocio.

### Con `billing`

En el futuro, suscripción y límites se asociarán al business.

### Con `analytics`

Las métricas agregadas suelen calcularse por business.

---

## 11. Diseño de tenancy

Este módulo es central para tenancy.

### Principio

El `businessId` es una pieza clave del scope de datos.

### Reglas

- ningún endpoint privado debe devolver un business no accesible por el usuario
- nunca confiar en `businessId` enviado por frontend sin validarlo contra memberships
- toda query relevante debe verificar pertenencia
- owner/admin de negocio pueden operar su business según permisos
- admins de plataforma pueden tener acceso cross-tenant solo en áreas internas explícitas

### Riesgos a evitar

- listar negocios globales sin filtro
- actualizar business por ID sin validar membership
- mezclar datos de branches/reviews de otro tenant
- usar selects internos desde frontend sin validación backend

---

## 12. Permisos sugeridos

### Platform Admin

Puede:

- crear cualquier business
- listar todos
- editar todos
- suspender
- archivar
- reactivar

### Business Owner

Puede:

- ver su business
- editar perfil y configuración permitida
- gestionar branding
- gestionar branches
- gestionar miembros según políticas futuras

### Business Admin

Puede:

- ver business
- editar parte importante de la configuración
- operar módulos internos del negocio

### Operator

Puede:

- ver business
- usar módulos operativos
- no debería cambiar configuraciones sensibles de cuenta

### Viewer

Puede:

- ver información básica del business
- no debería editar

---

## 13. Campos mínimos para MVP

Para crear un business en MVP, mínimo sugerido:

- `name`
- `slug`
- `industry` o categoría simple
- `country`
- `timezone`
- `currency`

Opcionales desde el inicio:

- `websiteUrl`
- `phone`
- `email`
- `description`
- `logoUrl`
- `primaryColor`

### Motivo

No frenar el onboarding por pedir demasiado.

---

## 14. Validaciones de negocio

### `name`

- requerido
- longitud razonable
- trim automático

### `slug`

- requerido
- único
- minúsculas
- sin espacios
- solo caracteres válidos para URL
- idealmente derivable del nombre al crear

### `email`

- formato válido
- opcional en MVP si no se usa todavía como contacto principal obligatorio

### `websiteUrl`

- URL válida si viene informada

### `phone`

- formato flexible pero saneado

### `country`

- requerido

### `timezone`

- requerida
- debe ser IANA válida si se quiere hacer prolijo desde el inicio

### `currency`

- requerida
- puede ser ISO code

### `status`

- restringido a enum permitido

---

## 15. Reglas de actualización

### Se puede actualizar

- nombre visible
- descripción
- sitio web
- teléfono
- email
- branding
- preferencias operativas
- URLs públicas
- configuración base

### Debe cuidarse especialmente

- slug
- status
- country
- timezone
- configuración que impacte otros módulos

### Recomendación

- `slug` debería ser editable solo por roles altos o incluso quedar bloqueado después del inicio si hay dependencias públicas
- cambios de `status` deben auditarse
- cambios que afecten links o widgets deben considerar impacto downstream

---

## 16. Endpoints sugeridos

## 16.1 Crear negocio

`POST /businesses`

### Uso

Crear una nueva cuenta negocio.

### Request ejemplo

```json
{
  "name": "Gains Montevideo",
  "slug": "gains-montevideo",
  "industry": "fitness",
  "country": "UY",
  "timezone": "America/Montevideo",
  "currency": "UYU",
  "websiteUrl": "https://gains.example.com"
}
```

### Response ejemplo

```json
{
  "id": "bus_123",
  "name": "Gains Montevideo",
  "slug": "gains-montevideo",
  "status": "draft",
  "country": "UY",
  "timezone": "America/Montevideo",
  "currency": "UYU",
  "createdAt": "2026-03-29T12:00:00.000Z"
}
```

## 16.2 Listar negocios accesibles

### `GET /businesses`

**Uso**

Listar negocios a los que el usuario tiene acceso.

**Regla**

No devolver todos los negocios globales salvo endpoint interno de plataforma.

## 16.3 Obtener negocio por ID

### `GET /businesses/:businessId`

**Uso**

Consultar detalle de negocio específico.

**Regla**

Validar membership o rol de plataforma.

## 16.4 Obtener negocio actual

### `GET /businesses/current`

**Uso**

Traer el contexto activo del usuario.

**Nota**

Muy útil para frontend y para evitar andar pasando IDs por todos lados.

## 16.5 Actualizar negocio

### `PATCH /businesses/:businessId`

**Uso**

Modificar datos del negocio.

**Regla**

Validar permiso y scope.

## 16.6 Cambiar estado

### `PATCH /businesses/:businessId/status`

**Uso**

Activar, suspender, archivar, etc.

**Regla**

No abierto a roles bajos.

## 16.7 Listar configuración del negocio

### `GET /businesses/:businessId/settings`

## 16.8 Actualizar configuración del negocio

### `PATCH /businesses/:businessId/settings`

---

# 17. DTOs sugeridos

## `CreateBusinessDto`

- `name`
- `slug`
- `industry`
- `country`
- `timezone`
- `currency`
- `websiteUrl?`
- `phone?`
- `email?`
- `description?`

## `UpdateBusinessDto`

- Todos opcionales
- No incluir campos bloqueados si no corresponde

## `UpdateBusinessStatusDto`

- `status`
- `reason?`

## `UpdateBusinessSettingsDto`

- `defaultLocale?`
- `defaultTone?`
- `autoEscalateLowRating?`
- `lowRatingThreshold?`
- `notifyOnNewReview?`
- `notifyOnNegativeReview?`

---

# 18. Eventos internos posibles

Aunque no se implementen todos ya, el módulo puede emitir eventos como:

- `business.created`
- `business.updated`
- `business.status_changed`
- `business.archived`
- `business.reactivated`
- `business.settings_updated`

Estos eventos pueden servir luego para:

- onboarding
- notificaciones
- activity logs
- analytics
- billing hooks

---

# 19. Auditoría

## Acciones que deberían auditarse

- creación de business
- cambio de nombre
- cambio de slug
- cambio de estado
- cambio de branding relevante
- cambio de configuración sensible
- archivado / reactivación

## Campos útiles en auditoría

- `actorUserId`
- `businessId`
- `action`
- `previousValue` resumido
- `newValue` resumido
- `timestamp`

---

# 20. Edge cases a contemplar

## Caso 1

**Usuario pertenece a múltiples negocios.**

**Solución**

- permitir seleccionar contexto activo
- evitar asumir un único business

## Caso 2

**Business sin branches todavía.**

**Solución**

- el sistema debe tolerarlo en onboarding inicial

## Caso 3

**Slug duplicado.**

**Solución**

- validación previa y constraint en DB

## Caso 4

**Business suspendido intenta operar campañas.**

**Solución**

- guard o policy central que bloquee acciones críticas

## Caso 5

**Cambio de slug rompe links públicos.**

**Solución**

- restringir edición o diseñar redirects/versionado después

## Caso 6

**Business archivado con histórico valioso.**

**Solución**

- jamás hard delete en operación normal

## Caso 7

**Configuraciones incompletas en draft.**

**Solución**

- permitir faltantes hasta momento de activación real

---

# 21. Qué NO hacer en este módulo

- no meter billing complejo todavía
- no convertir business en monstruo con 200 campos
- no mezclar memberships dentro de la misma tabla si rompe claridad
- no hardcodear defaults sin documentarlos
- no resolver acceso solo en frontend
- no permitir delete físico por endpoint público normal
- no acoplar campañas, reviews y widgets de forma circular

---

# 22. UI mínima necesaria

La UI para este módulo debe ser mínima pero suficiente.

## Pantallas mínimas sugeridas

### 1. Listado de negocios accesibles

Debe mostrar:

- nombre
- estado
- industria
- acción de entrar / cambiar contexto

### 2. Pantalla de detalle de negocio

Debe mostrar:

- nombre
- slug
- estado
- datos de contacto
- branding básico
- timezone / currency / country

### 3. Formulario de creación

Debe pedir solo lo mínimo.

### 4. Formulario de edición

Debe permitir editar lo esencial sin sobrecargar.

## Regla UI oficial

- Nada de sobrepulido visual ahora
- Nada de flows decorativos
- Nada de settings panel gigante
- Solo lo indispensable para operar el negocio

---

# 23. Datos demo sugeridos

## Ejemplo 1

- `name: Gains Montevideo`
- `slug: gains-montevideo`
- `industry: fitness`
- `country: UY`
- `timezone: America/Montevideo`
- `currency: UYU`

## Ejemplo 2

- `name: Clínica Delta`
- `slug: clinica-delta`
- `industry: health`
- `country: UY`
- `timezone: America/Montevideo`
- `currency: UYU`

---

# 24. Tests mínimos recomendados

## Unit tests

- normalización de slug
- validaciones de campos
- reglas de transición de estados si se implementan como lógica pura

## Integration tests

- crear business
- evitar slug duplicado
- actualizar business dentro del tenant correcto
- impedir acceso sin membership
- listar solo negocios accesibles
- cambiar estado con permisos correctos
- bloquear cambio de estado por rol insuficiente

## Contract / API tests

- `POST /businesses`
- `GET /businesses`
- `GET /businesses/:id`
- `PATCH /businesses/:id`
- `PATCH /businesses/:id/status`

## E2E futuros

- login
- crear negocio
- entrar al negocio
- editar datos
- cambiar contexto activo

---

# 25. Orden recomendado de implementación

1. Schema Prisma de `Business`
2. Relación con `Membership`
3. DTOs
4. Service
5. Controller
6. Guards / policies
7. Tests de integración
8. Pantalla mínima de listado y detalle
9. Edición básica
10. Settings si realmente hacen falta en la tanda

---

# 26. Definición de “done” del módulo

El módulo `businesses` está suficientemente listo cuando:

- se puede crear un negocio
- se puede consultar de forma segura
- se puede editar lo básico
- el acceso está scopeado por tenancy
- existe relación clara con memberships
- hay validaciones mínimas
- hay tests de permisos y acceso
- existe UI mínima para operar
- no hay hard delete expuesto
- el resto de módulos puede colgarse de `businessId`

---

# 27. Resumen práctico

`businesses` no es un módulo secundario.

Es la pieza que define la cuenta cliente y el scope real del sistema.  
Si este módulo queda flojo, todo el producto queda flojo.

## La prioridad acá es:

- claridad
- tenancy correcto
- permisos correctos
- modelo simple pero extensible
- UI mínima
- cero sobreingeniería
