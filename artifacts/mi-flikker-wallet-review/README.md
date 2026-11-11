# Mi Flikker · dirección wallet

[Comparación de las cuatro pantallas](comparison.html), [captura conjunta](comparison.png).

La comparación usa fixtures explícitos de revisión en la ruta real de Next. Los ejemplos están únicamente en browser-check.cjs; la UI de producto consume los endpoints existentes.

## Integración y fuentes

Se mantienen `/mi-flikker`, `?tab=desafios`, `?tab=premios` y `?tab=cuenta`, con la sesión global existente.

| Pantalla | Lectura real | Presentación |
| --- | --- | --- |
| Lugares | `/api/mi-flikker/places`: Customer vinculado a cuenta, Business, visitas, RewardGoal y beneficios emitidos | PlacePass con logo, color configurado, contraste calculado, progreso y franja de premios disponibles |
| Desafíos | `/api/mi-flikker/challenges`: CustomerMission, ReturnChallenge y rachas existentes | WalletChallengeCard; texto compartido con toRow; estado real, fecha límite, premio y enlace al detalle |
| Premios | `/api/mi-flikker/rewards`: BenefitParticipation | Emisiones AVAILABLE destacadas y accionables; REDEEMED/EXPIRED bajo Historial sin link ni código |
| Cuenta | `/api/mi-flikker/account`: teléfono verificado de FlikkerAccount y nombre del Customer reciente | Tarjeta de identidad; métricas de las listas ya leídas; logout existente separado abajo |

El wiring nuevo de API solo añade `timezone` de Business a desafíos de vuelta y rachas. Las misiones ya lo traían. Días restantes se calculan por días de calendario del negocio, sin desplazar su deadline. “Vence pronto” aparece al quedar 3 días o menos, o por estado AT_RISK de una racha. Sin timezone no se inventa una cantidad de días.

Las métricas de Cuenta aparecen cuando terminaron las lecturas necesarias; no usan valores de muestra ni ceros de cargas pendientes. Los errores de lectura se muestran con reintento y no se presentan como listas vacías.

## Archivos de esta entrega

- apps/web/app/(public)/mi-flikker/mi-flikker-client.tsx
- apps/web/app/(public)/mi-flikker/challenges-tab.tsx
- apps/web/app/(public)/mi-flikker/rewards-tab.tsx
- apps/web/app/(public)/mi-flikker/account-tab.tsx
- apps/web/components/public/mi-flikker-header.tsx (nuevo)
- apps/web/components/public/wallet-challenge-card.tsx (nuevo)
- apps/web/components/public/bottom-nav.tsx
- apps/web/components/public/customer-shell.tsx (wallet opcional, otros recorridos conservan su fondo)
- apps/web/app/(public)/mi-flikker/wallet.test.tsx (nuevo)
- apps/web/app/(public)/mi-flikker/challenges-tab.test.tsx
- apps/web/app/(public)/mi-flikker/rewards-tab.test.tsx
- apps/api/src/modules/flikker-account/my-flikker.service.ts
- apps/api/src/modules/flikker-account/my-flikker.service.spec.ts
- artifacts/mi-flikker-wallet-review/ (capturas, comparación y script de revisión)

La navegación compartida también se refleja en el detalle de negocio. Las cards y reglas de check-in, premios y desafíos no se modifican en esta entrega. Los cambios anteriores del working tree siguen conservados.

## Revisión reproducible

```powershell
npm run dev --workspace=apps/web -- --hostname 127.0.0.1
node artifacts/mi-flikker-wallet-review/browser-check.cjs
```

browser-check.cjs intercepta solo las respuestas API durante su ejecución y prueba las rutas reales: 4 pantallas × 3 estados × 4 anchos, navegación entre pestañas, logout, error/reintento y último contenido accesible por encima de la navegación. No instala rutas de fixture ni escribe datos del producto.
