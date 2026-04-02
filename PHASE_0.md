# PHASE_0.md

## Fase 0 — Fundación técnica

### Objetivo

La Fase 0 de este proyecto existe para construir una base técnica sólida, limpia y escalable sobre la cual se desarrollarán las fases posteriores del producto.

Esta fase no tiene como objetivo construir funcionalidades completas de negocio.  
Su propósito es dejar resueltos los cimientos del sistema para que el desarrollo posterior no se vuelva desordenado, frágil o difícil de mantener.

---

## Alcance oficial de la Fase 0

### 1. Estructura del proyecto

Crear un monorepo o repos separados con una convención estable.

Recomendación práctica:

```txt
apps/
  web/
  api/

packages/
  ui/
  config/
  types/
```

Objetivo:

- separar frontend y backend claramente
- permitir compartir UI, configuración y tipos
- mantener una convención estable desde el inicio
- facilitar escalabilidad y mantenibilidad

---

### 2. Tooling y calidad de código

Configurar:

- TypeScript estricto
- ESLint
- Prettier
- Husky
- lint-staged
- path aliases

Objetivo:

- mantener consistencia en el código
- prevenir errores básicos
- imponer disciplina de desarrollo desde el día uno
- evitar crecimiento caótico del repositorio

---

### 3. Estrategia multi-tenant

Definir y aplicar estrategia multi-tenant desde el día uno.

Base mínima requerida:

- `tenant_id` en entidades core
- guards de acceso
- queries seguras por tenant
- aislamiento correcto entre clientes

Objetivo:

- evitar mezcla de datos entre negocios
- reducir riesgo arquitectónico futuro
- impedir que tenancy se convierta en un parche posterior

---

### 4. Infraestructura local de desarrollo

Crear `docker-compose` con:

- PostgreSQL
- Redis
- Mailhog
- storage local

Objetivo:

- permitir levantar el proyecto rápidamente
- disponer de un entorno realista de desarrollo
- dejar preparado el terreno para colas, mails y archivos

---

### 5. Base de datos y entornos

Configurar:

- migrations
- seeds
- variables de entorno
- entornos `dev`, `staging` y `prod`

Objetivo:

- estandarizar cómo arranca y evoluciona el proyecto
- evitar diferencias manuales entre entornos
- facilitar onboarding técnico

---

### 6. Autenticación y autorización base

Implementar auth base con:

- login
- recuperación
- sesión
- RBAC
- middleware de autorización

Objetivo:

- asegurar acceso controlado
- dejar lista la base para usuarios internos y clientes
- permitir evolución futura sin rehacer auth

---

### 7. Observabilidad y operabilidad mínima

Agregar:

- logging estructurado
- Sentry
- health checks

Objetivo:

- detectar errores rápido
- facilitar debugging
- contar con una base operable desde etapas tempranas

---

## Qué NO entra en Fase 0

No corresponde desarrollar todavía:

- campañas
- requests de reseñas
- QR flows
- inbox de reseñas
- respuestas con IA
- widgets
- analytics
- billing
- automatizaciones avanzadas de negocio
- dashboards complejos
- features comerciales completas

Todo eso pertenece a fases posteriores.

---

## Entregable oficial de la fase

La Fase 0 se considera cerrada cuando existe:

- un repositorio limpio
- un proyecto arrancable por cualquier desarrollador en menos de 20 minutos
- login funcionando
- tenant demo creado
- pipeline de calidad corriendo

---

## Criterios prácticos de cierre

Para considerar esta fase realmente terminada, debe cumplirse lo siguiente:

- el repositorio se clona e instala sin fricción
- el entorno local levanta con Docker
- la base corre migrations y seeds sin problemas
- existe al menos un usuario demo funcional
- existe al menos un tenant demo funcional
- auth funciona de punta a punta
- la autorización base está aplicada
- las queries core ya contemplan tenant isolation
- lint, typecheck y tests mínimos corren correctamente
- existe un healthcheck funcional
- logging base está operativo
- Sentry quedó integrado o listo para integrarse sin rediseño

---

## Orden recomendado de implementación

### Paso 1

Cerrar estructura del repo, scripts, aliases y tooling.

### Paso 2

Cerrar infraestructura local con Docker, variables de entorno, migrations y seeds.

### Paso 3

Implementar auth base.

### Paso 4

Implementar tenancy base con guards, memberships y queries seguras.

### Paso 5

Crear tenant demo y usuario demo.

### Paso 6

Agregar logging, Sentry y health checks.

### Paso 7

Validar que cualquier desarrollador pueda levantar el proyecto en menos de 20 minutos.

---

## Reglas para ejecutar esta fase

- No mezclar migraciones, UI y lógica compleja en una sola tanda
- No desarrollar features de negocio todavía
- No romper aislamiento multi-tenant
- No agregar pantallas grandes sin flujo real detrás
- Cada cambio debe ser chico, mergeable y testeable
- Antes de codificar, siempre devolver un plan de implementación
- Priorizar base técnica antes que velocidad aparente

---

## Relación con documentos del proyecto

Claude o cualquier otro agente debe interpretar esta fase junto con:

- `ARCHITECTURE.md`
- `PRODUCT_SCOPE.md`
- `CLAUDE.md`
- documentación de módulos, por ejemplo:
  - `auth.md`
  - `businesses.md`
  - `memberships.md`

Importante:

Los documentos de módulo explican cómo debe funcionar cada dominio.\
Este documento define qué entra y qué no entra en la Fase 0.

---

## Resultado esperado

Al terminar la Fase 0, el proyecto debe tener una base seria, ordenada y operable, lista para comenzar la Fase 1 sin deuda técnica estructural innecesaria.
