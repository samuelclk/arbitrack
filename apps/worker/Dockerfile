FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# Copy workspace manifests first for cache reuse
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/worker/package.json ./apps/worker/

RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/shared ./packages/shared
COPY apps/worker ./apps/worker
COPY tsconfig.json ./

# Build shared package (worker uses tsx directly, no build needed)
RUN pnpm -F shared build

WORKDIR /app/apps/worker

ENV NODE_ENV=production
# Forever loop in prod; SIGTERM gracefully stops it
ENV WORKER_RUN_DURATION_MS=0

CMD ["pnpm", "dev"]
