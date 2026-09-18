# Sistema de emails de Flikker

## Inventario auditado

| Comunicación | Familia | Disparador | Plantilla | Estado |
| --- | --- | --- | --- | --- |
| Verificación de cuenta | Seguridad | Alta y reenvío de verificación | `auth-email-templates.ts` | Activa |
| Recuperación de contraseña | Seguridad | Solicitud de recuperación | `auth-email-templates.ts` | Activa |
| Premio por vencer | Clientes | Barrido diario de vencimientos | `email-templates.ts` | Activa |
| Progreso de tarjeta | Clientes | Automatización Retention V2 | `email-templates.ts` | Activa |
| Reactivación | Clientes | Automatización Retention V2 | `email-templates.ts` | Activa |
| Cumpleaños | Clientes | Barrido diario Pro | `email-templates.ts` | Activa |
| Promoción manual | Clientes | Envío desde Notificaciones | `email-templates.ts` | Activa |
| Primera semana | Onboarding | Día 7 | `owner-lifecycle-email-templates.ts` | Activa |
| Resumen semanal V2 | Operación | Lunes 09:00 | `owner-lifecycle-email-templates.ts` | Activa |
| Resumen mensual | Operación | Día 1, 09:00 | `owner-lifecycle-email-templates.ts` | Activa |
| Primer mes | Onboarding | Día 30 | `owner-lifecycle-email-templates.ts` | Activa |
| Fin de prueba | Upgrade | 5 y 2 días antes | `owner-lifecycle-email-templates.ts` | Activa |
| Feedback bajo | Acción requerida | Opinión con score bajo | `owner-notifications.worker.ts` | Activa |
| Resumen semanal Legacy | Operación | Lunes 09:00 para negocios Legacy | `owner-notifications.worker.ts` | Activa |

No se encontraron templates de email muertos adicionales. Los hitos se envían
solo por WhatsApp. El welcome de clientes, desbloqueo de recompensa, OTP de
teléfono y campañas generales también tienen recorridos exclusivamente por
WhatsApp, por lo que no deben contarse como emails faltantes.

## Arquitectura

- `email-design-system.ts` concentra layout, tokens, header con wordmark SVG,
  preheader, botones, callouts, códigos, métricas, footer y escape de contenido.
- Las plantillas continúan devolviendo `{ subject, html }` y el transporte sigue
  siendo `EmailService` + Resend. No se alteraron jobs, destinatarios ni reglas
  de negocio.
- El HTML usa tablas de presentación, estilos inline, ancho máximo de 600 px,
  tipografías de sistema y una adaptación móvil mínima. No depende de Google
  Fonts, gradientes CSS ni JavaScript.
- Los mensajes transaccionales conservan vencimientos y avisos de seguridad. El
  checkout de Pro conserva la URL de Mercado Pago existente.

## Previews

Desde `apps/api`:

```bash
npm run emails:preview
```

El comando genera `.email-previews/index.html` y 15 escenarios individuales,
incluyendo variantes con poca actividad, progreso/reactivación y ambos resúmenes
semanales. El directorio generado es local y está ignorado por Git.

## Verificación

Las pruebas cubren el sistema base, escape HTML, seguridad, comunicaciones a
clientes, estados opcionales, compatibilidad estructural, las plantillas de
ciclo de vida y el catálogo completo de previews.
