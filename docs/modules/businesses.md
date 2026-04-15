# businesses.md

## 1. Objetivo

El módulo `businesses` existe para definir el tenant operativo principal del MVP.

Su función es simple:

- identificar a qué negocio pertenece la operación
- dar contexto a campañas, reseñas y widgets
- guardar una identidad mínima del negocio
- permitir memberships y control básico de acceso

Este módulo no existe para construir un ERP, un CRM ni una capa administrativa compleja.
Existe para soportar bien el flujo central del MVP.

### En la práctica, este módulo debe permitir

- crear o registrar un negocio
- editar sus datos básicos
- mantener un brand profile mínimo
- guardar links básicos útiles para campañas o widgets
- marcar si el negocio está activo o inactivo
- asociar usuarios mediante memberships

---

## 2. Entidades mínimas

Para el MVP, este módulo debe mantenerse chico.

### 2.1 Business

Entidad principal.
Representa el tenant operativo del sistema.

Campos conceptuales:

- identidad del negocio
- estado operativo básico
- datos públicos mínimos
- links básicos

### 2.2 BusinessBrandProfile

No tiene que ser una entidad separada obligatoriamente.
Puede vivir dentro de `Business` si eso simplifica el modelo.

Su alcance es mínimo:

- nombre visible si difiere del legal
- logo o imagen base si existe
- color principal opcional

### 2.3 Membership

Relación entre usuario y negocio.

Permite:

- saber quién pertenece al negocio
- saber con qué rol opera
- resolver acceso al tenant

No hace falta una capa más compleja en esta etapa.

---

## 3. Reglas de negocio

### Regla 1

Todo lo operativo del MVP vive bajo un `business`.

### Regla 2

Campañas, reseñas y widgets deben quedar asociados al negocio correcto.

### Regla 3

Un usuario no obtiene acceso a un negocio por conocer su ID.
El acceso se valida por membership y rol.

### Regla 4

Un usuario puede pertenecer a uno o más negocios.

### Regla 5

Debe existir un negocio activo de trabajo para operar el sistema.

### Regla 6

El negocio puede tener un estado simple:

- `active`
- `inactive`

No hace falta modelar más estados si no aportan al MVP.

### Regla 7

Si un negocio está inactivo, puede bloquear creación o edición de operaciones sensibles según política simple.

### Regla 8

Los links básicos del negocio existen para apoyar campañas, redirects o widgets, no para resolver una presencia digital completa.

### Regla 9

El módulo debe mantenerse deliberadamente chico.
Si una regla no ayuda a campaigns, reviews, responses mínimas o widgets, probablemente sobra.

---

## 4. Campos imprescindibles

### Business

Campos mínimos recomendados:

- `id`
- `name`
- `slug`
- `status`
- `websiteUrl` opcional
- `googleReviewUrl` opcional
- `googleBusinessProfileUrl` opcional
- `logoUrl` opcional
- `brandColor` opcional
- `createdAt`
- `updatedAt`

### Notas

- `name` es obligatorio
- `slug` debe ser único y estable
- `status` puede defaultear a `active`
- `websiteUrl` sirve si luego el widget se embebe en el sitio del cliente
- `googleReviewUrl` puede servir como destino base de campañas
- `googleBusinessProfileUrl` es útil pero opcional
- `logoUrl` y `brandColor` son branding mínimo, no una capa de diseño completa

### Membership

Campos mínimos recomendados:

- `id`
- `userId`
- `businessId`
- `role`
- `status`
- `createdAt`

### Roles mínimos

- `owner`
- `admin`
- `operator`
- `viewer`

No abrir permisos ultra granulares en este módulo.

---

## 5. Endpoints mínimos

El módulo necesita solo endpoints que soporten operación real del MVP.

### Privados

- `GET /businesses`
  Lista negocios accesibles por el usuario.

- `GET /businesses/current`
  Devuelve el negocio activo de trabajo.

- `GET /businesses/:businessId`
  Devuelve detalle básico del negocio si el usuario tiene acceso.

- `POST /businesses`
  Crea un negocio nuevo si esa capacidad existe en el flujo actual.

- `PATCH /businesses/:businessId`
  Actualiza datos básicos y brand profile mínimo.

- `PATCH /businesses/:businessId/status`
  Cambia entre `active` e `inactive` si se expone esa operación.

### Relacionados con memberships

- `GET /auth/memberships`
- `POST /auth/switch-business`

### Regla

No abrir endpoints de settings gigantes ni administración global compleja en esta etapa.

---

## 6. UI mínima

La UI de este módulo debe ser mínima y operativa.

### Pantallas mínimas

#### 1. Selector o listado de negocios accesibles

Debe permitir:

- ver nombre del negocio
- ver estado básico
- entrar o cambiar contexto activo

#### 2. Vista básica del negocio actual

Debe mostrar:

- nombre
- slug
- links básicos
- branding mínimo
- estado

#### 3. Formulario simple de edición

Debe permitir editar:

- nombre
- slug si corresponde
- website
- links básicos
- logo opcional
- color principal opcional
- estado si aplica

### Regla UI

Nada de panel administrativo complejo.
Nada de settings infinitos.
Solo lo indispensable para que el negocio exista y soporte el resto del flujo.

---

## 7. Flujos manuales que conviven

En este MVP, varias cosas pueden convivir con operación manual sin problema.

### Aceptable en esta etapa

- crear negocio manualmente desde panel interno
- cargar o corregir branding básico de forma manual
- pegar links base de Google o del sitio manualmente
- activar o inactivar negocio manualmente
- gestionar memberships de forma simple

### Importante

No hace falta automatizar onboarding, branding ni configuraciones raras para validar el MVP.

---

## 8. Tests mínimos

### Unit

- validación de slug
- reglas básicas de estado si existen helpers
- resolución simple de permisos por rol

### Integration

- crear negocio
- listar solo negocios accesibles
- obtener negocio actual
- impedir acceso a negocio ajeno
- actualizar negocio dentro del tenant correcto
- cambiar estado con permisos correctos

### Contract

- `GET /businesses`
- `GET /businesses/current`
- `GET /businesses/:businessId`
- `POST /businesses`
- `PATCH /businesses/:businessId`

### E2E relacionado

- login
- ver negocios accesibles
- cambiar negocio activo
- usar ese negocio para crear campaña después

---

## 9. Qué se deja para después

Queda explícitamente fuera por ahora:

- branches complejas
- múltiples marcas por negocio
- configuraciones avanzadas por negocio
- planes
- billing
- admin global complejo
- onboarding automatizado
- estados sofisticados de cuenta
- permisos ultra granulares
- settings panel grande
- relaciones comerciales o contractuales complejas

### Regla final

`businesses` en este MVP no es un sistema administrativo completo.
Es la base mínima para que `campaigns`, `reviews` y `widgets` tengan un tenant claro, seguro y usable.
