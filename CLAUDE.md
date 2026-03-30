# CLAUDE.md

## 1. Propósito de este archivo

Este archivo define cómo debe trabajar Claude Code dentro de este repositorio.

No es un documento de producto.
No es un documento de arquitectura detallada.
Es una guía operativa obligatoria para colaborar sin romper el proyecto.

Claude debe leer este archivo antes de proponer o modificar código.

---

## 2. Contexto del proyecto

Este repositorio pertenece a Flikker OS.

Flikker OS es un sistema multi-tenant de reputación local y presencia digital para negocios locales.

El sistema está orientado a:

- captación de reseñas por QR / links / campañas
- tracking de eventos
- gestión de reseñas
- respuestas asistidas
- widgets de prueba social
- generación de activos a partir de reseñas
- operación interna por cuenta
- futura capa de analytics, billing y robustez

La prioridad actual es construir una base sólida y usable, no un producto visualmente perfecto.

---

## 3. Documentos que debes leer antes de cambios importantes

Antes de tocar módulos relevantes, lee:

1. `ARCHITECTURE.md`
2. `PRODUCT_SCOPE.md`
3. `README.md`
4. `docs/modules/*.md` del módulo afectado, si existen
5. `docs/adr/*.md` si el cambio toca decisiones base

Si no leíste estos documentos, no asumas comportamiento.

---

## 4. Reglas no negociables de trabajo

### Regla 1

Nunca empieces escribiendo código grande sin devolver antes un plan corto y concreto.

Siempre debes devolver primero:

- objetivo
- archivos a tocar
- pasos
- riesgos
- tests a crear o correr

### Regla 2

Trabaja en tandas chicas, mergeables y revisables.

Evita cambios gigantes.

### Regla 3

No mezcles demasiadas cosas a la vez.

No combines en una sola tanda:

- migraciones + lógica compleja + UI grande
- refactor general + feature nueva
- auth + billing + tenancy
- rediseño visual + cambio crítico de negocio

### Regla 4

Respeta estrictamente multi-tenancy.

Nunca asumas acceso por frontend.
Nunca dejes datos de un negocio visibles para otro.
Nunca confíes solo en client-side checks.

### Regla 5

El backend manda en permisos y reglas.

El frontend no es fuente de verdad para:

- tenancy
- roles
- permisos
- restricciones críticas
- validaciones de negocio

### Regla 6

El frontend debe ser mínimo indispensable.

Cuando una feature necesite UI:

- construye solo la UI mínima necesaria para operar y validar el flujo
- no sobre-diseñes
- no metas animaciones innecesarias
- no conviertas una pantalla interna en un proyecto visual separado
- prioriza claridad, velocidad y mantenimiento

Yo luego puedo embellecer el frontend manualmente.

### Regla 7

No toques archivos no relacionados.

Si una tarea es puntual, mantén el diff enfocado.

### Regla 8

No inventes reglas de negocio.

Si una restricción no está en los documentos ni en el ticket, deja explícita la duda en tu plan.

### Regla 9

Siempre deja el módulo más consistente que antes.

No introduzcas deuda gratuita.

### Regla 10

Al terminar, resume:

- qué cambiaste
- qué falta
- edge cases detectados
- riesgos pendientes

---

## 5. Estilo esperado de colaboración

Quiero que trabajes como un staff engineer prudente.

Eso implica:

- pensar antes de tocar
- dividir antes de implementar
- no entusiasmarte con refactors masivos
- respetar el alcance
- avisar riesgos
- priorizar mantenibilidad sobre brillantez innecesaria

Tu objetivo no es impresionar.
Tu objetivo es avanzar sin caos.

---

## 6. Orden correcto para implementar cualquier módulo

Cuando te pida construir o modificar un módulo, sigue este orden:

1. entender objetivo funcional
2. revisar reglas de negocio
3. proponer plan
4. definir o ajustar modelo de datos
5. definir DTOs / contratos
6. implementar servicios / lógica
7. agregar tests
8. recién después agregar frontend mínimo indispensable
9. actualizar docs si corresponde

No inviertas este orden salvo pedido explícito.

---

## 7. Qué debes revisar siempre

En cualquier cambio relevante revisa:

- tenancy
- permisos
- naming
- validaciones
- errores
- migraciones
- edge cases
- consistencia de tipos
- tests afectados
- impacto en otros módulos
- documentación desactualizada

---

## 8. Convenciones de repo

### Monorepo

Estructura base:

```txt
apps/
  web/
  api/
packages/
  ui/
  config/
  types/
docs/
  modules/
  adr/
  runbooks/
```

### Estructura del proyecto

### Backend

**Ubicación:** `apps/api`

Se trabaja por módulos de dominio dentro de: `src/modules/`

### Cada módulo debe agrupar

- dto
- controllers
- services
- repositories
- tests
- module file

---

### Frontend

**Ubicación:** `apps/web`

### Stack

- Next.js
- TypeScript
- App Router
- shadcn/ui
- Tailwind

### Regla clave

El frontend se construye **solo cuando habilita un flujo real**.

---

### Packages compartidos

Ubicación: `packages/`

- `packages/ui` → componentes compartidos
- `packages/config` → configuración común
- `packages/types` → tipos compartidos (solo cuando tenga sentido)

---

## 9. Convenciones de código

### Generales

- TypeScript estricto
- Nombres claros
- Funciones chicas si se puede
- Evitar duplicación tonta
- Comentarios solo si agregan contexto real
- No hardcodear valores sensibles
- No dejar TODOs vacíos sin contexto

---

### Backend

- DTOs explícitos
- Validación declarativa
- Servicios con responsabilidad clara
- Lógica de negocio fuera de controladores
- Guards / policies para permisos
- Errores consistentes

---

### Frontend

- Componentes simples
- Formularios claros
- Estados de loading / error / success razonables
- Evitar sobrecomponentización prematura
- Evitar efectos visuales irrelevantes en pantallas internas

---

## 10. Regla explícita sobre diseño frontend

### Importante

El frontend **NO debe intentar quedar “terminado visualmente”** en cada feature.

Debe resolver el flujo con el menor costo de complejidad posible.

### Regla

Si una vista necesita:

- tabla → hacer tabla simple
- filtro → hacerlo básico
- formulario → limpio y funcional

NO buscar perfección visual.

El refinamiento vendrá después.

### Aplica especialmente a

- Paneles internos
- CRUDs
- Dashboards preliminares
- Vistas de administración
- Formularios de configuración

---

## 11. Testing

Siempre que implementes algo, define qué pruebas corresponden.

### Prioridades

- Unit tests → reglas puras
- Integration tests → servicios y DB
- Contract tests → endpoints críticos

### Flujos sensibles

Si tocas algo crítico:

- mencionar si merece E2E

### Regla de cierre

No se considera terminado si:

- rompe typecheck
- rompe lint
- rompe tests relacionados
- deja migraciones incoherentes

---

## 12. Migraciones

### Reglas

- Mantenerlas chicas y claras
- No mezclar muchas tablas si no hace falta
- Nombres entendibles
- Revisar relaciones e índices
- No modificar schema de forma caótica

### Importante

Si la tarea es solo de modelo:

NO adelantar UI ni lógica (salvo que se pida)

---

## 13. Seguridad

Siempre revisar:

- Tenant scoping en backend
- Roles / permisos
- Validación de inputs
- Sanitización si hay contenido público
- Rate limit en endpoints públicos (si aplica)
- Exposición accidental de datos
- Secrets por entorno (nunca hardcodeados)

---

## 14. Cuándo frenar y preguntar

NO avanzar directo si detectas:

- Ambigüedad de negocio relevante
- Conflicto con `ARCHITECTURE.md`
- Riesgo de romper multi-tenancy
- Necesidad de refactor masivo
- Decisión arquitectónica no documentada
- Contradicción con `PRODUCT_SCOPE.md`

### En esos casos

Explicar el conflicto primero en el plan.

---

## 15. Formato de respuesta antes de implementar

Cuando se pide una tarea relevante, responder con:

- Objetivo
- Archivos a tocar
- Plan por pasos
- Riesgos
- Tests a crear/correr
- Qué NO se tocará

Luego:

- Esperar aprobación  
  o
- Ejecutar solo el primer paso (si se indicó)

---

## 16. Formato de cierre tras implementar

Siempre responder con:

- Cambios realizados
- Archivos tocados
- Tests corridos
- Deuda pendiente
- Edge cases detectados
- Siguiente subpaso recomendado

---

## 17. Anti-patrones prohibidos

Evitar completamente:

- Hacer toda la feature de una
- Tocar muchos archivos sin justificar
- Mezclar UI, migraciones y lógica en una sola tanda
- Resolver permisos desde frontend
- Asumir un solo tenant
- Crear componentes enormes sin necesidad
- Refactors cosméticos prematuros
- Mover carpetas sin razón fuerte
- Inventar modelos fuera del producto

---

## 18. Prioridades actuales del proyecto

Orden de prioridad:

1. Fundación técnica
2. Auth
3. Memberships / tenancy
4. Businesses / branches
5. Campaigns / QR codes
6. Reviews
7. Responses
8. Widgets
9. Operación
10. Analytics
11. Billing
12. Robustez

### Regla

Si hay conflicto, priorizar lo más cercano al núcleo operativo.

---

## 19. Cómo pensar el frontend

### Guideline oficial

1. Utilidad
2. Claridad
3. Estética (después)

### Regla clave

Entre:

- pantalla simple que funciona
- pantalla compleja más linda

👉 Elegir siempre la simple que funciona

---

## 20. Qué hacer si la tarea es demasiado grande

- No resolver todo de una
- Dividir en subpasos mergeables
- Proponer primera tanda pequeña y segura
- Priorizar:
  - base de datos
  - contratos
  - dominio  
    antes que UI

---

## 21. Meta de calidad

Queremos velocidad, pero sin caos.

### Estándar del proyecto

- Código claro
- Flujo usable
- Seguridad razonable
- Tenancy correcto
- Base mantenible
- Frontend suficiente (no inflado)
