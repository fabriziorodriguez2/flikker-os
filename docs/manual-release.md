# Manual Release Runbook

Minimal manual release flow for the current monorepo. This assumes a real
PostgreSQL database already exists and the deployment target can inject
environment variables.

## Required Environment Variables

Backend (`apps/api`):

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DBNAME?schema=public"
JWT_SECRET="a-long-random-production-secret"
API_BASE_URL="https://api.example.com"
WEB_BASE_URL="https://app.example.com"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"
PORT=3000
NODE_ENV=production
```

Frontend (`apps/web`):

```bash
API_URL="https://api.example.com"
NODE_ENV=production
```

## Release Order

Run from the repository root unless a step says otherwise.

```bash
npm ci
```

Inject the production environment variables in the deploy platform or shell.
Do not use localhost values in production for `API_URL`, `API_BASE_URL`, or
`WEB_BASE_URL`.

```bash
npm run prisma:generate --workspace=apps/api
npm run prisma:migrate:deploy --workspace=apps/api
```

Only seed non-production/demo environments unless you intentionally want demo
data in the target database:

```bash
npm run seed --workspace=apps/api
```

Build both apps:

```bash
npm run build --workspace=apps/api
npm run build --workspace=apps/web
```

Start the backend:

```bash
npm run start:prod --workspace=apps/api
```

Start the frontend:

```bash
npm run start --workspace=apps/web
```

For a simple backend-only release command that generates Prisma Client, applies
migrations, and starts the API:

```bash
npm run start:release --workspace=apps/api
```

## Prisma CLI Availability

`prisma migrate deploy` requires the Prisma CLI to be available in the
environment where the command runs. In this repo, `prisma` is currently a
devDependency of `apps/api`, so migration commands work after a full `npm ci`.
If a hosting platform installs production dependencies only, run migrations in a
build/release step that includes devDependencies, or move/provide the Prisma CLI
in that release environment.

The API runtime itself uses `@prisma/client`, `@prisma/adapter-pg`, and `pg`,
which are production dependencies.

## CORS Note

The current frontend calls the backend from Next.js server-side route handlers
using `API_URL`, so browser CORS is not required for that path.

Add `enableCors()` in `apps/api/src/main.ts` only if browsers will call the API
directly from a different origin, for example `https://app.example.com` calling
`https://api.example.com` from client-side code. In that case, configure a
strict allowlist for the frontend origin instead of enabling open CORS.
