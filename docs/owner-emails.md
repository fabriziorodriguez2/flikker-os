# Emails del dueño

Ambos renderers devuelven `{ subject, html }`, el contrato actual de `EmailService.send` (Resend). No se agrega un motor ni dependencia de ejecución.

## Bienvenido a Flikker

`renderWelcomeEmail` se exporta desde `owner-lifecycle-email-templates.ts`. Espera `businessName`; acepta `configurationUrl` (por defecto `/dashboard`) y `assets`. `OwnerLifecycleEmailsService` completa el nombre desde `Business.name` y envía a los OWNER/ADMIN activos usando `notificationEmail` o, en su ausencia, `email`. Usa el barrido horario existente: bienvenida en las primeras 24 horas después de `onboardingCompletedAt`, incluso si cruza medianoche, con deduplicación `welcome/once`. No envía bienvenidas retroactivas a negocios activados hace más de 24 horas. Requiere el worker/Redis y Resend configurados, igual que los otros emails. La ventana de 24 horas no recupera un onboarding ocurrido durante una interrupción más larga del worker; los fallos siguen la política existente del log de ciclo de vida.

```ts
const email = renderWelcomeEmail({ businessName: business.name });
await emailService.send({ to: ownerEmail, ...email });
```

## Tu semana en Flikker

El cron y worker existentes conservan su programación y deduplicación. `OwnerLifecycleEmailsService` pasa un `report` a `renderWeeklySummaryEmail`. Los callers antiguos sin `report` conservan el template anterior.

| Campo del report | Significado / fuente |
| --- | --- |
| week_range | Semana anterior completa, en zona horaria del negocio |
| active_customers | Clientes únicos con visitas en el período |
| returning_customers | Clientes con visitas esta semana y antes de ella; fuente canónica BusinessImpact |
| total_interactions | Visitas registradas; no incluye mensajes o clics |
| new_customers | Clientes identificados en el período, fuente canónica BusinessImpact |
| recurring_customers | Opcional; clientes con más de una visita dentro de esta semana |
| top_benefit_name | Título del beneficio con más canjes del período, o null |
| top_benefit_redemptions | Canjes de ese beneficio, con límite inferior y superior |
| best_day_name | Día con más visitas, o null si no hay actividad |
| best_day_count | Visitas del mejor día |
| days | Array `{ name, count }` ordenado de lunes a domingo |

Empates: se elige el primer día de la semana; beneficios se desempatan por ID. El bloque de retorno describe visitas observadas, no atribución causal medida.

## Imágenes

El logo PNG es una rasterización del SVG original `apps/web/public/flikker-wordmark.svg`, sin rediseñarlo. Se sirve desde `/flikker-email-logo.png`. El soporte existente se sirve desde `/qr-nfc-support.png`. URLs absolutas se construyen con `APP_PUBLIC_URL`, luego `WEB_BASE_URL`, igual que los enlaces existentes. El sitio público debe servir esos archivos sin autenticación.

`assets` permite sobreescribir `logoUrl`, `customerExperienceUrl`, `dashboardUrl`, `scanExperienceUrl`, `qrSupportUrl`, `weeklyHeroUrl` y `benefitExperienceUrl` mediante URLs HTTP(S) públicas.

También se pueden configurar `EMAIL_CUSTOMER_EXPERIENCE_URL`, `EMAIL_DASHBOARD_URL`, `EMAIL_SCAN_EXPERIENCE_URL`, `EMAIL_WEEKLY_HERO_URL` y `EMAIL_BENEFIT_EXPERIENCE_URL`. La captura del dashboard debe entregarse sin barra roja superior. Las referencias no estaban adjuntas a la conversación ni disponibles en el repo; las imágenes faltantes se omiten, sin URLs rotas ni pantallas inventadas. El teléfono vacío existente no se usa. No hay avatares.

## Preview y compatibilidad

Desde la raíz: `node apps/api/node_modules/ts-node/dist/bin.js --project apps/api/tsconfig.json apps/api/scripts/preview-owner-emails.ts`. Escribe dos HTML con datos de ejemplo en `artifacts/owner-emails`. Para visualización local, usar un servidor HTTP para assets y establecer `APP_PUBLIC_URL` a su origen.

Tablas, estilos inline, fuentes de sistema, PNG e imágenes normales; CTA con color sólido y padding para Outlook. Outlook clásico puede mostrar esquinas rectas y omitir sombras. La jerarquía y los números se mantienen al bloquear imágenes. Falta validación de envío real en Gmail, Outlook y Apple Mail, y aprobación visual con las capturas originales.
