# Lynkro Outbound — apps/api
# Se construye desde la raíz del monorepo: docker build -f apps/api/Dockerfile .
FROM node:22-slim AS base
RUN corepack enable
WORKDIR /repo

FROM base AS install
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages ./packages
COPY apps/api ./apps/api
COPY apps/worker/package.json ./apps/worker/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm install --frozen-lockfile

FROM install AS runtime
RUN pnpm --filter @lynkro-outbound/db run generate
ENV NODE_ENV=production
EXPOSE 4000
CMD ["pnpm", "--filter", "@lynkro-outbound/api", "run", "start"]
