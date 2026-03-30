# auth.md

## Objetivo

Resolver acceso seguro al sistema, sesiones, autenticación, autorización y pertenencia a negocio.

Este módulo existe para que cada acción del sistema ocurra con:

- usuario identificado
- tenant/business correcto
- rol válido
- auditoría mínima

No resuelve billing, onboarding ni reglas de campañas. Solo identidad, sesión y permisos.

---

## Qué resuelve

- login
- logout
- refresh token
- recuperación de contraseña
- invitaciones
- selección de negocio actual
- RBAC por negocio
- guards de tenant
- sesión actual

---

## Qué NO resuelve todavía

- SSO enterprise
- SCIM
- MFA avanzado
- permisos ultra granulares por acción custom
- auditoría enterprise muy profunda

---

## Entidades

### User

Campos base:

- id
- email
- passwordHash
- firstName
- lastName
- isActive
- createdAt
- updatedAt

### Session

- id
- userId
- refreshTokenHash
- userAgent
- ip
- expiresAt
- revokedAt
- createdAt

### Membership

- id
- userId
- businessId
- role
- status
- invitedByUserId
- createdAt
- updatedAt

### PasswordResetToken

- id
- userId
- tokenHash
- expiresAt
- usedAt

### AuditLog

- id
- businessId nullable
- actorUserId nullable
- action
- entityType
- entityId
- metadataJson
- createdAt

---

## Reglas de negocio

1. Un usuario puede pertenecer a múltiples negocios.
2. El acceso operativo siempre ocurre dentro de un negocio actual.
3. Toda ruta privada debe resolver `currentUser` y `currentBusiness`.
4. Si el usuario no pertenece al negocio pedido, se rechaza.
5. Roles iniciales:
   - owner
   - admin
   - operator
   - viewer
6. `owner` puede gestionar membresías y configuración sensible.
7. `viewer` no modifica datos.
8. Un usuario desactivado no puede iniciar sesión.
9. Refresh tokens revocados no sirven.
10. Nunca confiar en el rol que venga desde frontend.

---

## Endpoints

### Públicos

- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `POST /auth/logout`

### Privados

- `GET /auth/me`
- `GET /auth/memberships`
- `POST /auth/switch-business`
- `POST /businesses/:businessId/invitations`
- `POST /invitations/:token/accept`

---

## DTOs principales

### LoginDto

- email
- password

### RefreshDto

- refreshToken

### ForgotPasswordDto

- email

### ResetPasswordDto

- token
- newPassword

### InviteMemberDto

- email
- role

### SwitchBusinessDto

- businessId

---

## Permisos

### owner

- todo dentro del negocio
- invitaciones
- cambios sensibles de cuenta

### admin

- casi todo operativo
- no billing sensible si luego se restringe

### operator

- gestión diaria
- no administración de miembros

### viewer

- solo lectura

---

## Flujos clave

### Login

1. validar credenciales
2. emitir access token
3. emitir refresh token
4. devolver memberships
5. si tiene un solo negocio, setearlo como current

### Invitación

1. owner/admin invita por email
2. se genera token
3. receptor acepta
4. se crea o actualiza membership

### Cambio de negocio

1. usuario pide cambiar business
2. backend verifica membership activa
3. devuelve nuevo contexto

---

## UI mínima necesaria

- pantalla de login
- forgot password simple
- selector de negocio si pertenece a más de uno
- pantalla mínima de miembros e invitaciones más adelante

Nada de UI compleja al inicio.

---

## Eventos

- `auth.login.succeeded`
- `auth.login.failed`
- `auth.password_reset.requested`
- `auth.password_reset.completed`
- `auth.membership.invited`
- `auth.membership.accepted`
- `auth.business.switched`

---

## Observabilidad

Loggear:

- intentos fallidos de login
- cambio de negocio
- invitaciones
- reseteo de contraseña
- revocación de sesión

No loggear:

- contraseñas
- tokens en claro

---

## Tests

### Unit

- hash y comparación de password
- resolución de permisos por rol
- expiración de tokens

### Integration

- login correcto / incorrecto
- refresh válido / inválido
- switch business con membership y sin membership
- invitación y aceptación

### Contract

- errores de auth
- respuestas de `/auth/me`

### E2E

- login
- cambio de negocio
- acceso bloqueado a tenant ajeno

---

## Edge cases

- usuario con 0 memberships
- usuario con membership desactivada
- token de invitación expirado
- refresh token reutilizado luego de logout
- usuario eliminado pero con sesión vieja
- cambio de negocio a uno no permitido

---

## Definición de listo

Este módulo está listo cuando:

- se puede iniciar sesión
- se puede resolver usuario + negocio actual
- existen roles por negocio
- toda ruta privada puede usar guards seguros
- hay tests básicos
