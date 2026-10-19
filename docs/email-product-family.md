# Confirmación, bienvenida y resumen semanal

## Auditoría y alcance

- `apps/api/src/jobs/auth-email-templates.ts`: confirmación de cuenta y recuperación.
  Solo se rediseña la confirmación; mantiene `buildVerificationEmail` y sus argumentos.
- `apps/api/src/jobs/registration-subscription-email-templates.ts`: bienvenida Base
  de `REGISTRATION_COMPLETED` y confirmación/bienvenida Pro de `SUBSCRIPTION_PAID`.
- `apps/api/src/jobs/owner-product-email-templates.ts`: `renderWeeklyProductEmail`
  es el resumen de la referencia. También contiene otra bienvenida posterior al
  onboarding. Ambas reutilizan el shell extraído, sin cambiar sus disparadores.
- `apps/api/src/jobs/email-design-system.ts`: helpers anteriores usados por otras
  comunicaciones. Se reutilizan escape HTML, resolución de URL y tipo de CTA.
- `apps/api/src/jobs/email.service.ts`: transporte HTML mediante Resend, intacto.
- `apps/web/public/flikker-email-logo.png`: logo oficial que ya usaba el resumen.
  Se conserva ese PNG para esta familia, evitando depender de soporte SVG.

## Sistema visual compartido

`product-email-layout.ts` extrae el lenguaje visual del resumen: shell blanco de
600 px, fondo `#F7F6FA`, violeta `#7059D9`, Arial/Helvetica, wordmark de 126 px,
heading de 32 px, cards de 24 px de padding, CTA de ancho completo y footer
«Flikker · Más motivos para volver.». Tokens, cards, headings, párrafos, CTA y
layout son compartidos por confirmación, bienvenida Base/Pro y resumen.

La estructura es fluida aun sin media queries; usa tablas, estilos inline y
wrapper condicional de 600 px para Outlook. Los ajustes móviles solo reducen
padding. No requiere fuentes externas, JavaScript, flex ni grid en los emails.
El JavaScript del comparador local pertenece exclusivamente a las previews.
Se quitó la sombra del shell original; se conservan contenido y métricas del resumen.

## Datos y texto

Con autorización explícita del usuario, `RegistrationCompletedService` amplía
solo el `select` existente de Business y pasa `subscription.plan` a la plantilla.
No cambia claims, eventos, condiciones de envío, destinatarios ni WhatsApp.
El límite sale de `plan.maxCustomers`; `null` significa sin tope. El slug `free`
se presenta como «Plan Base», el nombre comercial solicitado. Los slugs Pro no
muestran copy de Base. Sin contexto de plan se omiten promesas de plan/límite.

La variante Pro ya existía y recibe el contexto de un pago confirmado; conserva
el asunto y la guía opcional. No se modifican webhooks ni billing.

`buildVerificationEmailText` y el campo `text` de ambas bienvenidas exponen
versiones de texto con el mismo contenido, URL original y valores dinámicos.
También se exportan como `.txt` en las previews. **El transporte existente solo
envía HTML**: estas versiones de texto no se agregan al payload de Resend, de
acuerdo con el alcance que excluye cambios al transporte y al envío.
Tokens, expiración de 48 horas y auth permanecen intactos.

## Previews y comprobación visual

Desde la raíz:

```powershell
npm run emails:preview --workspace=apps/api
npm run emails:check-previews --workspace=apps/api
```

Abrir `apps/api/.email-previews/product-family.html` para comparar confirmación,
bienvenida Base, bienvenida Pro y resumen semanal. Permite alternar desktop,
320, 375 y 390 px. Usa fixtures identificados como ejemplos y copias locales
de los assets oficiales, sin credenciales ni envío de emails.

El segundo comando verifica en Chromium las cuatro plantillas en esos cuatro
anchos: overflow horizontal, ancho del shell, logo cargado, CTA de ancho completo
con altura mínima de 44 px y footer. Genera 16 capturas individuales, cuatro
comparativas y `visual-checks.json`. Los artefactos están ignorados por Git.
Esto no sustituye una prueba de entrega en Gmail, Outlook y Apple Mail reales.

## Resultado de validación (19 de octubre de 2026)

- 197 tests pasan en 18 suites relacionadas con emails, auth, registro y aviso Pro.
- Typecheck completo de API y web: correcto.
- 16 comprobaciones visuales: correctas; capturas comparativas revisadas.
- Prettier de todos los archivos de código modificados: correcto.
- Lint de los archivos TypeScript modificados: correcto.
- El lint global de API reporta 106 errores en archivos ajenos al cambio; el de
  web reporta otros seis. No se amplía el alcance para corregirlos.
- La corrida que incluye `lifecycle-emails.service.integration.spec.ts` tiene dos
  fallos al crear el negocio en Prisma. Una comprobación de conexión de solo
  lectura devuelve `ECONNREFUSED`; no se cambia configuración ni base de datos.

No se realizaron deploy, commit ni push.
