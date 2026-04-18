FROM node:22-slim AS builder

WORKDIR /app

# Copy root package files for workspace resolution
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json

# Install dependencies
RUN npm ci

# Copy source
COPY apps/api apps/api

# Generate Prisma client and build
RUN npm run prisma:generate --workspace=apps/api
RUN npm run build --workspace=apps/api

# --- Production stage ---
FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json

RUN npm ci --omit=dev

COPY --from=builder /app/apps/api/dist apps/api/dist
COPY --from=builder /app/apps/api/prisma apps/api/prisma

RUN npm run prisma:generate --workspace=apps/api

EXPOSE 3000

CMD ["sh", "-c", "npm run prisma:migrate:deploy --workspace=apps/api && npm run start:prod --workspace=apps/api"]
