# Lynkro Outbound — apps/worker
# Se construye desde la raíz del monorepo: docker build -f apps/worker/Dockerfile .
FROM node:22-slim AS base
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo

FROM base AS install
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages ./packages
COPY apps/worker ./apps/worker
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm install --frozen-lockfile

FROM install AS runtime
RUN pnpm --filter @lynkro-outbound/db run generate
ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@lynkro-outbound/worker", "run", "start"]
