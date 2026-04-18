FROM node:22-slim AS builder

WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json

# Install all dependencies (dev included for build)
RUN npm ci

# Copy web source
COPY apps/web apps/web

# Build Next.js (standalone output)
RUN npm run build --workspace=apps/web

# --- Production stage ---
FROM node:22-slim

WORKDIR /app

# Copy standalone server (includes node_modules it needs)
COPY --from=builder /app/apps/web/.next/standalone ./
# Copy static assets and public files
COPY --from=builder /app/apps/web/.next/static apps/web/.next/static
COPY --from=builder /app/apps/web/public apps/web/public

ENV HOSTNAME=0.0.0.0
ENV PORT=3000
EXPOSE 3000

CMD ["node", "apps/web/server.js"]
