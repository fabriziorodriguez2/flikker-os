# Detalle de lugar y actividad

Pantalla real: `apps/web/app/(public)/mi-flikker/[businessId]/place-detail-client.tsx`.
Las vistas HTML y las capturas de esta carpeta son fixtures explícitos de revisión; la pantalla consume exclusivamente el backend.

## Integración

- `GET /public/my-flikker/:businessId/activity?cursor=…`: sesión global existente, cliente activo resuelto por cuenta + negocio. Sin customerId aportado por el navegador.
- Proxy Next: `/api/mi-flikker/places/:businessId/activity`. Cookie existente, respuestas privadas sin cache.
- Respuesta: `items`, `total`, `nextCursor`, `timezone`, `snapshot`. Eventos: `id`, `type`, `occurredAt`, `title`, `description`.
- 20 filas por página. Orden fecha descendente + identificador ascendente, cursor validado por negocio, corte temporal fijo. Una consulta agregada y una resolución de cliente por página, sin N+1 ni historial completo cargado en Node.
- `PlaceActivity` muestra Hoy/Ayer/mes según la zona horaria real del negocio; estados carga, error con reintento, muchos/pocos/vacío y Ver más.
- `LoyaltyCard compact` comparte tema, patrón y renderer de sellos con la tarjeta existente. `CustomerShell` tiene un encabezado de detalle con logo real o inicial. Se conservan BenefitCard, ChallengeRow y BottomNav.

## Fuentes y certeza histórica

| Movimiento | Fuente |
| --- | --- |
| Visita | Visit.occurredAt; solo visitas registradas |
| Sello por visita | Visit dentro del intervalo guardado de CustomerRewardGoal: estrictamente después de activatedAt, hasta el cierre/desbloqueo/vencimiento. Una sola fila por visita; no otra VISIT redundante |
| Sello extra | RewardGoalBonusStamp.createdAt y reasonCode |
| Beneficio desbloqueado | BenefitParticipation.createdAt con código de canje; no participaciones de sorteo sin premio |
| Canje | BenefitParticipation.redeemedAt |
| Vencimiento | BenefitParticipation.expiresAt, alcanzado y sin canje |
| Desafío | CustomerMission.completedAt y Mission.name; ReturnChallenge.completedAt |
| Opinión | CheckinFeedback.createdAt; FeedbackResponse.createdAt |

No se reconstruyen counters históricos, “primer sello”, motivos de escaneos rechazados, clicks en Google ni vencimientos sin fecha individual persistida. No existen registros de los escaneos rechazados para mostrarlos como actividad. El título histórico del beneficio usa benefitTitleSnapshot; un registro antiguo sin snapshot muestra el evento genérico. El nombre de misión es el actual porque no hay snapshot histórico. No se cambian reglas ni se escriben eventos nuevos.

## Archivos de esta implementación

- API: place-activity.service.ts, place-activity.service.spec.ts, place-activity.postgres.spec.ts; registro en flikker-account.module.ts y ruta en my-flikker.controller.ts.
- Test PostgreSQL aislado: apps/api/test/place-activity.postgres.cjs.
- Web: place-detail-client.tsx, place-activity.tsx y place-activity.test.tsx, loyalty-card.tsx, customer-shell.tsx y el proxy activity/route.ts.
- Revisión: esta carpeta. Los cambios previos de check-in y panel siguen en el working tree.

## Reproducir verificaciones

```powershell
npm test --workspace=apps/api -- --runInBand --testPathPatterns="(place-activity|my-flikker.service)"
node apps/api/test/place-activity.postgres.cjs
node artifacts/place-detail-review/render.cjs
```

Para browser-check.cjs, primero levantar `npm run dev --workspace=apps/web -- --hostname 127.0.0.1`. Prueba la ruta real con respuestas API interceptadas solo durante el test: paginación, fallo y reintento, deduplicación, navegación inferior y estados. No agrega rutas de fixture al producto.
