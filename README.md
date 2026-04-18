Email: admin@flikker.dev
Password: Flikker2026!

npm run start:dev backend
npm run dev frontend

Matriz de permisos enforced
Acción OWNER ADMIN OPERATOR VIEWER
Listar miembros Si Si Si Si
Ver detalle Si Si Si Si
Agregar (cualquier rol) Si - No No
Agregar (OPERATOR/VIEWER) Si Si No No
Agregar (OWNER/ADMIN) Si No (403) No No
Cambiar rol Si No No No
Revocar acceso Si No No No

Cómo correr seeds

cd apps/api
npx tsx prisma/seed.ts
Idempotente — se puede correr múltiples veces sin duplicar datos.

Credenciales demo
Email Password Rol Negocios
admin@flikker.dev Flikker2026! OWNER + Platform Admin Gains, Delta, Nómade
admin2@flikker.dev Flikker2026! ADMIN Gains
ops@flikker.dev Flikker2026! OPERATOR Gains, Café Brava
viewer@flikker.dev Flikker2026! VIEWER Delta
cafe@flikker.dev Flikker2026! OWNER Café Brava (Free)
vet@flikker.dev Flikker2026! OWNER Veterinaria (Trial)
multi@flikker.dev Flikker2026! ADMIN/OPERATOR Delta, Vet, Gains
revoked@flikker.dev Flikker2026! REVOKED Gains (sin acceso)
Escenarios listos para demo
Negocio Pro maduro — Gains con 3 branches, 5 miembros, branding completo, logoUrl, Google Business Profile
Negocio Starter activo — Delta con 2 branches, 3 miembros, branding profesional
Free al límite — Café Brava con 1 branch y 2 miembros (máximo Free) — agregar más dispara ForbiddenException
Trial activo — Veterinaria en TRIALING (14 días), branding parcial, 2 branches
Onboarding vacío — Studio Nómade en DRAFT, sin branches ni plan
Multi-tenancy — admin@ en 3 negocios, multi@ en 3 negocios, ops@ en 2
Membership revocada — revoked@ en Gains con status REVOKED
Platform admin — admin@ con isPlatformAdmin: true

CONTRASEÑA BASE SUPABASE: qbHK@ZZA%r75sKb
postgresql://postgres:[YOUR-PASSWORD]@db.qqgcqiyalulcaecpmeem.supabase.co:5432/postgres
USUARIO PRISMA SUPABASE CONTRASEÑAS: qbHK@ZZA%r75sKb
DATABASE_URL="postgresql://prisma.qqgcqiyalulcaecpmeem:qbHK@ZZA%r75sKb@aws-1-us-east-1.pooler.supabase.com:5432/postgres"
JWT_SECRET="6f1f1f7e0f8a9f1d3b7d5a6c0e9f2a4b8c1d3e5f7a9b0c2d4e6f8a1b3c5d7e9"
API_BASE_URL="https://tu-backend-production.up.railway.app"
WEB_BASE_URL="https://tu-frontend-production.up.railway.app"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"
PORT=3000
NODE_ENV=production
