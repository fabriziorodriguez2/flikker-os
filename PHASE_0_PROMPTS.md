Implementemos solo la base de autenticación para Fase 0.

Objetivo:

- login
- registro inicial si aplica
- sesión
- recuperación básica si ya está contemplada
- RBAC mínimo
- estructura limpia para escalar

Reglas:

- No hagas UI compleja
- No hagas features del producto
- No toques billing ni campañas
- No mezcles tenancy profunda todavía si no es necesario para este paso
- Hacé solo lo necesario para dejar auth funcional y prolijo

Quiero que:

1. me digas el plan corto
2. implementes solo este paso
3. corras typecheck/lint/tests afectados
4. me resumas qué cambió
5. me señales deuda pendiente

---

Ahora implementemos solo la base multi-tenant del sistema.

Objetivo:

- modelado mínimo para tenant/business
- memberships
- roles por negocio
- guards o validación de acceso base
- tenant scoping en backend desde el día uno

Importante:

- No hagas features de campañas, reviews ni widgets
- No hagas UI grande
- No mezcles esto con refactors generales
- Priorizá seguridad de acceso y claridad del modelo

Quiero:

1. plan breve
2. cambios solo para este paso
3. migraciones claras
4. seeds mínimas si hacen falta
5. tests de tenancy/roles
6. resumen final con edge cases

---

Implementemos solo seeds demo y core mínimo de negocio para la Fase 0/Fase 1 inicial.

Objetivo:

- business demo
- al menos una branch demo
- uno o más usuarios demo
- memberships demo
- branding/config mínima si ya tiene sentido
- datos suficientes para probar login + acceso + tenant real

Reglas:

- Nada de campañas ni reseñas todavía
- Nada de dashboard complejo
- Seeds reproducibles y limpias
- Que sirvan para mostrar y testear el sistema

Al final:

- explicame cómo ejecutar las seeds
- mostrame qué entidades quedaron listas
- decime si esto ya deja preparado el salto a Core de negocio

---

Quiero dejar el backend listo como base modular, sin meter lógica de negocio avanzada todavía.

Usá la estructura por módulos de dominio dentro de apps/api/src/modules.

Creá o ajustá solo el esqueleto inicial para:

- auth
- businesses
- memberships
- branches
- common/infra si hace falta

Cada módulo debería tener, cuando aplique:

- dto
- controllers
- services
- repositories
- tests
- module file

No implementes features avanzadas.
No hagas endpoints innecesarios.
Priorizá estructura, consistencia y escalabilidad.

Antes de escribir código:

1. decime qué carpetas/archivos crearías
2. justificá brevemente la estructura
3. recién después ejecutá

---

Implementemos solo el shell base del frontend para la Fase 0.

Objetivo:

- app shell
- layout base
- auth screens mínimas o placeholders si corresponde
- estructura de rutas inicial
- espacio futuro para panel interno y panel cliente
- design system base usando lo ya instalado

No quiero:

- páginas completas de negocio
- dashboards falsos enormes
- componentes innecesarios
- UI pesada sin flujo real

Quiero una base limpia, simple y extensible.
Primero devolveme:

1. estructura propuesta
2. rutas iniciales
3. componentes mínimos necesarios
4. después recién implementá

---

Quiero cerrar la Fase 0 con calidad mínima de proyecto.

Implementá solo lo necesario para:

- healthcheck endpoint
- logging estructurado base
- manejo de errores consistente
- validaciones mínimas
- scripts de lint, typecheck y test claros
- si aplica, CI básica

No agregues features del producto.
No hagas sobreingeniería.
Quiero una base seria pero simple.

Al final:

1. decime qué falta todavía para considerar Fase 0 cerrada
2. listame el checklist cumplido
3. marcame riesgos pendientes

---

Actuá como staff engineer revisando esta base de proyecto.

Quiero que audites:

- arquitectura
- tenancy
- auth
- estructura modular
- Prisma schema
- riesgos de escalabilidad
- naming
- deuda técnica real
- cosas que podrían romperse al arrancar Fase 1

No modifiques archivos.
Solo devolvé:

1. problemas encontrados
2. prioridad de cada uno
3. qué arreglar antes de pasar a Core de negocio
4. qué ya está suficientemente bien
