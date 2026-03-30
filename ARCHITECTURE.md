# ARCHITECTURE.md

## 1. Propósito de este documento

Este documento congela las decisiones base de arquitectura de Flikker OS para evitar cambios impulsivos durante las primeras semanas de desarrollo.

Flikker OS es un sistema multi-tenant orientado a reputación local, captación de reseñas, respuesta asistida, prueba social embebible y operación interna para cuentas cliente.

Este archivo define:

- stack oficial
- estructura del monorepo
- principios de dominio
- estrategia multi-tenant
- convenciones de backend y frontend
- reglas de crecimiento del sistema
- límites de lo que NO se debe improvisar

---

## 2. Objetivo del producto a nivel arquitectura

No estamos construyendo una app aislada de QR ni una simple web de marketing.

Estamos construyendo una plataforma que permita:

- generar canales trazables para pedir reseñas
- registrar eventos y campañas por negocio/sucursal
- administrar reseñas y su estado operativo
- asistir la respuesta con IA
- reutilizar reseñas como prueba social
- mostrar esa prueba social en widgets
- soportar operación interna y crecimiento por cuenta

La arquitectura debe permitir evolucionar desde MVP operable hacia producto más robusto sin reescritura completa.

---

## 3. Stack oficial congelado

### Frontend

- Next.js
- TypeScript
- App Router
- shadcn/ui
- Tailwind CSS

### Backend

- NestJS
- TypeScript

### Base de datos

- PostgreSQL

### ORM

- Prisma

### Jobs / colas

- BullMQ
- Redis

### Storage

- Cloudinary para assets visuales
- S3 compatible opcional en el futuro si hiciera falta storage más general

### Auth

- Auth propia basada en backend + JWT + refresh tokens + RBAC
- El control de permisos vive en backend, nunca solo en frontend

### Observabilidad

- logs estructurados
- Sentry en web y api
- health checks en api

### Testing

- unit: Vitest o Jest según package
- integration / contract: Jest + Supertest en api
- E2E: Playwright en momentos críticos

### Infra local de desarrollo

- Docker Compose para:
  - postgres
  - redis
  - mailhog opcional
  - servicios auxiliares si se suman luego

---

## 4. Decisiones congeladas

Estas decisiones no deben reabrirse salvo problema real importante:

1. Monorepo con workspaces.
2. Frontend separado de backend.
3. PostgreSQL como base central.
4. Prisma como ORM.
5. Multi-tenant desde el día uno.
6. Dominios alineados a negocio, no a “capas genéricas”.
7. Claude Code trabaja por tandas chicas, nunca en cambios gigantes.
8. El frontend no se sobreconstruye: solo se hace lo mínimo indispensable para habilitar y validar flujo.
9. La seguridad de tenancy, permisos y validaciones se resuelve en backend.
10. No se mezcla refactor general con feature nueva en el mismo PR.

---

## 5. Estructura del repositorio

flikker-os/
├─ apps/
│ ├─ web/
│ └─ api/
├─ packages/
│ ├─ ui/
│ ├─ config/
│ └─ types/
├─ docs/
│ ├─ modules/
│ ├─ adr/
│ └─ runbooks/
├─ ARCHITECTURE.md
├─ PRODUCT_SCOPE.md
├─ CLAUDE.md
└─ README.md

### apps/web

Aplicación frontend principal.

Responsabilidades:

- shells de app
- páginas internas
- pantallas mínimas para operar módulos
- formularios
- tablas
- vistas de dashboard
- landings públicas cuando existan

### apps/api

Backend principal.

Responsabilidades:

- módulos de dominio
- auth
- RBAC
- tenancy guards
- validación de DTOs
- servicios
- jobs
- webhooks
- integraciones
- endpoints públicos y privados

### packages/ui

Componentes compartidos de UI.

### packages/config

Configuraciones compartidas:

- tsconfig base
- eslint
- prettier
- env typing
- constantes cross-project

### packages/types

Tipos compartidos entre frontend y backend cuando valga la pena.

### docs/modules

Documentación funcional y técnica por módulo.

### docs/adr

Architecture Decision Records.

### docs/runbooks

Guías operativas:

- levantar entorno
- deploy
- rollback
- seeds
- migraciones
- troubleshooting

---

### 6. Organización por dominios

El sistema se organiza por dominios del negocio, no por carpetas abstractas eternas.

Dominios principales:

- auth
- users
- memberships
- businesses
- branches
- brand-profile
- campaigns
- qr-codes
- redirect-events
- reviews
- review-tags
- review-status
- response-templates
- responses
- widgets
- assets
- analytics
- onboarding
- notifications
- billing
- platform-ops

Cada dominio debe intentar vivir de punta a punta con:

- modelo de datos
- DTOs
- reglas
- servicio
- controlador
- tests
- documentación

---

## 7. Estructura de módulos en backend

Dentro de apps/api/src/modules:

modules/
├─ auth/
├─ users/
├─ memberships/
├─ businesses/
├─ branches/
├─ campaigns/
├─ reviews/
├─ responses/
├─ widgets/
├─ assets/
├─ analytics/
├─ onboarding/
├─ billing/
├─ common/
└─ jobs/

Cada módulo debería tender a esta forma:

reviews/
├─ dto/
├─ entities/
├─ controllers/
├─ services/
├─ repositories/
├─ policies/
├─ tests/
└─ reviews.module.ts

---

## 8. Estrategia multi-tenant

Multi-tenant no es opcional.

### Regla principal

Toda entidad de negocio relevante debe quedar scoped a tenant/business desde el diseño inicial.

### Entidades núcleo para tenancy

- users
- businesses
- memberships
- branches
- campaigns
- reviews
- responses
- widgets
- assets
- subscriptions

### Principios

1. Nunca confiar en filtros del frontend.
2. Toda query sensible debe llevar scope de negocio.
3. Los roles se evalúan en backend.
4. Los usuarios pueden pertenecer a uno o más negocios mediante memberships.
5. El backend debe validar acceso al tenant actual en cada request privada.

### Modelo

- users
- businesses
- memberships
- roles

### Roles iniciales

- owner
- admin
- operator
- viewer

---

## 9. Modelado inicial de base de datos

Orden de modelado recomendado:

1. users
2. sessions / refresh tokens
3. roles / memberships
4. businesses
5. branches
6. brand_profiles
7. plans
8. subscriptions
9. campaigns
10. qr_codes
11. redirect_targets
12. qr_events
13. review_sources
14. reviews
15. review_tags
16. review_states
17. review_response_templates
18. review_responses
19. response_versions
20. widgets
21. 1widget_items
22. widget_impressions
23. asset_templates
24. content_assets
25. asset_exports
26. notifications
27. onboarding_tasks
28. account_notes
29. activity_logs

### Principios de modelado

- primero entidades estables
- después tablas derivadas o agregadas
- analytics compleja sale luego por vistas, jobs o tablas agregadas
- no meter métricas derivadas en el corazón del modelo demasiado temprano

---

## 10. Contrato entre Frontend y Backend

### Regla general

El frontend consume API explícita.  
No se acopla directo a la base ni a hacks internos.

### Backend debe proveer

- DTOs claros
- Validación de inputs
- Errores consistentes
- Contratos estables
- Permisos por endpoint
- Respuestas pensadas para operación real

### Frontend debe hacer

- Formularios básicos
- Navegación clara
- Tablas mínimas
- Feedback de loading / error / success
- UX suficiente para usar el sistema

### Frontend NO debe hacer al inicio

- Animaciones innecesarias
- Refactors cosméticos grandes
- Dashboards rebuscados
- Design system ultra elaborado
- Resolver lógica sensible de negocio
- Pantallas “lindas” sin flujo respaldado

---

## 11. Política explícita sobre frontend

El frontend debe ser funcional, limpio y suficiente.

### Regla oficial del proyecto

Cuando una funcionalidad requiera interfaz, se implementará únicamente el frontend mínimo indispensable para:

- usar
- probar
- validar el flujo de negocio

La prioridad está en:

- dominio
- datos
- contratos
- seguridad
- operación

El refinamiento visual vendrá después.

### Esto significa

- Si hace falta una tabla → hacer una tabla simple
- Si hace falta un formulario → hacerlo simple
- Si hace falta un dashboard → primero KPIs mínimos
- Si hace falta una vista interna → NO convertirla en producto visual complejo

### Objetivo del frontend

Habilitar operación y validación.  
NO ganar premios de diseño.

---

## 12. Estrategia de desarrollo

Se trabaja por **vertical slices**.

### Orden de desarrollo por feature

1. Diseño funcional
2. Modelo de datos
3. Contrato API
4. Lógica de dominio
5. Tests
6. Frontend mínimo indispensable
7. Observabilidad
8. Documentación

### Regla clave

No construir capas sueltas sin cerrar un flujo usable.

---

## 13. Testing strategy

### Unit

Para:

- Validaciones puras
- Reglas de negocio
- Mapeos
- Utilidades

### Integration

Para:

- Servicios con DB
- Guards
- Policies
- Repositorios
- Jobs

### Contract

Para:

- Endpoints críticos
- Payloads válidos / inválidos
- Códigos de error
- Permisos

### E2E

Flujos importantes:

- Login
- Crear negocio
- Crear campaña
- Generar QR
- Cargar / ver reseñas
- Responder reseña
- Ver widget

---

## 14. Seguridad

Obligatorio desde el inicio:

- RBAC estricto
- Tenant scoping en backend
- Validación DTO
- Sanitización de contenido visible
- Rate limits en endpoints públicos
- Secrets por entorno
- Logs con correlation id donde tenga sentido
- Protección de endpoints de widgets y redirecciones públicas
- Auditoría de acciones sensibles

---

## 15. Observabilidad

Mínimo requerido:

- Logs estructurados en API
- Captura de errores con contexto
- Health endpoint
- Sentry
- Logging útil en jobs y procesos de sincronización
- Activity log para acciones internas sensibles

---

## 16. Criterios para aceptar cambios de arquitectura

Solo se cambia una decisión base si:

- Hay bloqueo técnico serio
- Afecta mucho velocidad o mantenibilidad
- Existe evidencia concreta
- El cambio queda documentado en `docs/adr/`

### Regla

Nunca cambiar stack por:

- Moda
- Entusiasmo
- Aburrimiento

---

## 17. Qué queda explícitamente fuera por ahora

- App móvil
- CRM grande
- Inbox omnicanal
- Automatizaciones complejas de redes sociales
- Analytics sofisticada prematura
- Self-service multiempresa completo
- Builder visual de landing muy avanzado
- Sistema de billing enterprise complejo

---

## 18. Estado actual de prioridad arquitectónica

### Prioridades reales del proyecto

1. Fundación técnica
2. Auth + tenancy
3. Core negocio
4. Campañas + QR + tracking
5. Reseñas
6. Respuestas
7. Widgets
8. Operación interna
9. Analytics
10. Billing robusto

---

## 19. Resumen ejecutivo de arquitectura

Flikker OS se construye como:

- Monorepo TypeScript
- Frontend: Next.js
- Backend: NestJS
- DB: PostgreSQL
- ORM: Prisma

### Características clave

- Organizado por dominios
- Multi-tenant desde el inicio
- Backend fuerte
- Frontend deliberadamente mínimo

### Prioridad real

No es hacerlo lindo.

Es hacerlo:

- Usable
- Seguro
- Mantenible
- Escalable sin caos
