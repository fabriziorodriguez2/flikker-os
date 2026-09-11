# Auditoría previa — rediseño del panel, Fase 1

Fecha: 2026-09-10

## 1. Tokens existentes

`apps/web/app/globals.css` define hoy tokens globales para fondo, texto, superficies, bordes, marca, estados y sombras:

- Base: `--background`, `--foreground`, `--surface`, `--surface-muted`, `--surface-subtle`.
- Bordes: `--border`, `--border-strong`.
- Texto: `--text-muted`, `--text-soft`.
- Marca: `--brand-primary`, `--brand-accent`, `--brand-soft`, `--brand-warm`.
- Estados: `--success-*`, `--warning-*`, `--danger-*`.
- Sombras: `--shadow-soft`, `--shadow-card`.
- Tipografía: Montserrat para body y Syne para `h1`/branding.

El problema no es la ausencia total de tokens sino su alcance global y su baja adopción: el panel contiene más de 3.300 colores hexadecimales, más de 700 radios arbitrarios y cerca de 100 sombras arbitrarias en TSX.

## 2. Componentes compartidos existentes

### UI general

- `PageHeader`
- `SectionCard`
- `MetricCard`
- `KPICard`
- `StatusBadge`
- `EmptyState`
- `Switch`
- `ValidatedInput`
- `FlikkerSelect`
- `PhoneInput`
- `OtpInput`
- `ToastProvider`
- `RouteProgressBar`
- `BusinessLoadError`

### Panel y dominio

- `SettingsTabs`
- `ManagersOnly`
- `AbsorbedRoute`
- `ReviewsTable` y `ReviewFiltersBar`
- `SettingsFormSection`
- `CampaignStatusBadge`
- `AdminStatusBadge`
- múltiples cards, filtros y modales específicos de cada dominio.

## 3. Estado de las primitives propuestas

| Primitive | Estado real | Decisión de Fase 1 |
|---|---|---|
| Button | No existe una primitive; hay botones inline y constantes locales | Crear una única `Button` |
| IconButton | No existe | No crear aún; se deriva después de validar `Button` |
| Input | No existe base; `ValidatedInput` solo añade validación | Crear `Input` y permitir composición con validación |
| Textarea | No existe base | Crear junto a `Input`, misma anatomía visual |
| Select | Existe `FlikkerSelect`, custom y accesible | Normalizarlo; no crear otro select custom |
| Checkbox | Solo implementaciones locales | No crear aún |
| Radio | Solo implementaciones locales | No crear aún |
| Switch | Existe compartido | Normalizar tokens y foco |
| Badge | Existe `StatusBadge`; hay duplicados de dominio | Ampliar el compartido sin romper la API actual |
| Tabs | `SettingsTabs` existe, pero está acoplado a rutas, rol y experiencia | Crear una primitive presentacional; no tocar su lógica todavía |
| Card | `SectionCard` existe, pero no hay contenedor genérico | Crear `Card` y hacer que `SectionCard` lo componga |
| DataTable | No existe; hay nueve tablas de panel independientes | No crear hasta la fase de tablas/piloto |
| Dialog | No existe shell común; hay al menos ocho overlays locales | No crear hasta migrar un flujo real |
| Drawer | `CustomerModal` funciona como drawer específico | No crear hasta el piloto de Clientes |
| EmptyState | Existe | Normalizar visualmente bajo scope nuevo |
| ErrorState | Hay errores locales y `BusinessLoadError` | Crear `InlineNotice`; posponer `ErrorState` completo |
| Skeleton | Hay loaders locales y `RouteProgressBar` | No abstraer todavía |
| InlineNotice | No existe | Crear |
| PageHeader | Existe | Refactor visual compatible |
| SectionHeader | No existe como primitive | Crear y usar desde `SectionCard` |
| Metric | `MetricCard` y `KPICard` se superponen | Crear `Metric`; mantener wrappers compatibles |
| Toolbar | Hay toolbars locales | No crear hasta migrar una página real |
| FilterBar | Existen filtros de dominio | No crear hasta el piloto |
| FormField | No existe | Crear sin reescribir formularios todavía |

## 4. Duplicaciones relevantes

- `MetricCard` y `KPICard` comparten etiqueta, valor y metadata.
- `StatusBadge`, `AdminStatusBadge`, `CampaignStatusBadge` y badges inline repiten estructura y tonos.
- `SettingsTabs`, tabs de Programa y tabs de Notificaciones reconstruyen patrones segmentados por pantalla.
- Inputs se redefinen mediante constantes `inputClass` en Clientes, Beneficios, Sucursales, Equipo, Programa, Settings y Retention V2.
- Los modales de campañas, misiones, Google, diseño y clientes repiten overlay, panel, header y footer.
- Las tablas de Clientes LEGACY, Check-ins, Beneficios, Campañas, Reviews y Retention repiten superficies, headers y estados.

## 5. Dependencias funcionales que deben preservarse

### Rol y permisos

- `RoleProvider` expone el rol efectivo.
- `useCanMutate`: OWNER, ADMIN y OPERATOR pueden mutar; VIEWER no.
- `useIsOwnerOrAdmin`: refleja endpoints restringidos a OWNER/ADMIN.
- `ManagersOnly`: evita montar pantallas cuyos GET también devolverían 403.
- El backend sigue siendo la autoridad; los guards visuales solo evitan una UX inválida.

### Experience version

- `ExperienceProvider` distingue `LEGACY` y `CHECKIN_V2`.
- Un valor ausente/fallido cae de forma segura a LEGACY.
- Inicio y Reviews eligen implementación según experiencia.
- Varias rutas antiguas siguen siendo el producto real de LEGACY.

### Impersonation

- El layout usa el token y business efectivos de impersonation.
- `redirectIfAbsorbed` no redirige durante impersonation para conservar herramientas técnicas.
- Insights es una excepción deliberada: durante impersonation muestra la experiencia real del negocio.

### Platform Admin

- La sección “Herramientas Flikker” depende de `session.user.isPlatformAdmin`, no del rol de negocio.
- `/dashboard/test-lab` tiene además un redirect server-side si el usuario no es Platform Admin.

## 6. Superficies OWNER-facing reales

### CHECKIN_V2

- Inicio
- Insights
- Programa — visible solo a OWNER/ADMIN
- Clientes
- Notificaciones
- Reseñas
- QR y NFC
- Configuración y Suscripción según los guards existentes

### LEGACY

- Panel
- Insights
- Clientes
- Campañas
- Reseñas
- Beneficios
- Retención
- Configuración por URL y sus tabs según rol, aunque parte de esa navegación no esté en el sidebar.

## 7. Rutas internas bajo `/dashboard`

- Retention V2: interfaz técnica; absorbida por Notificaciones para un dueño CHECKIN_V2 real.
- Check-ins: herramienta técnica; absorbida por Clientes/QR y NFC.
- Beneficios standalone: absorbida por Programa en CHECKIN_V2; sigue siendo owner-facing en LEGACY.
- Campañas standalone: absorbida por Notificaciones/Promociones en CHECKIN_V2; owner-facing en LEGACY.
- Widgets: herramienta visible al operador durante impersonation; producto real en contextos LEGACY específicos.
- Test Lab: Platform Admin-only con guard server-side.
- “Herramientas Flikker” del sidebar: se agrega solo para Platform Admin.

## 8. CSS global con alcance más amplio que el panel

`globals.css` se importa desde el root layout y afecta todas las rutas. Son especialmente sensibles:

- `:root`, `@theme inline` y `:root[data-theme="dark"]`.
- `body`, `h1` y `h2`–`h6`.
- reglas globales de `select` y elementos interactivos.
- `.flikker-card`, `.flikker-input`, `.flikker-control` y helpers heredados usados fuera del panel.
- animaciones y clases de check-in/customer-facing.
- `.flk-customer`, que protege explícitamente las superficies públicas con Montserrat.

Por eso la nueva fundación se encapsula en `.flikker-panel-v2`, aplicada solo cuando `experienceVersion === "CHECKIN_V2"`. Los tokens `--panel-*` no reemplazan los tokens públicos ni los `--pub-*`, y Geist se carga únicamente en ese wrapper.

## 9. Corte de implementación aprobado por la auditoría

Crear en Fase 1:

- `Button`
- `Input` y `Textarea`
- `FormField`
- `Tabs` presentacional
- `Card`
- `InlineNotice`
- `SectionHeader`
- `Metric`

Normalizar sin duplicar:

- `FlikkerSelect`
- `Switch`
- `StatusBadge`
- `EmptyState`
- `PageHeader`
- `SectionCard`
- `MetricCard` y `KPICard` como wrappers compatibles

Posponer:

- `IconButton`
- `Checkbox` y `Radio`
- `DataTable`
- `Dialog` y `Drawer`
- `Skeleton`
- `Toolbar` y `FilterBar`

No se modifica en Fase 1 ningún request, endpoint, payload, redirect, guard, permiso, mutation, toast ni adapter de datos.
