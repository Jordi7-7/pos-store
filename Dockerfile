# --- Build Stage ---
FROM node:24-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --dangerously-allow-all-builds

COPY . .
RUN pnpm run build

# Descartar devDependencies para dejar solo producción en node_modules
RUN pnpm prune --prod

# --- Production Stage ---
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
# pnpm también en la imagen final: las migraciones se ejecutan con `pnpm run migration:run:prod`
# pnpm no debe reinstalar dependencias al arrancar (node_modules ya viene podado y sin red en producción)
ENV pnpm_config_verify_deps_before_run=false
RUN corepack enable && corepack prepare pnpm@11.17.0 --activate
COPY package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Limitar memoria de V8 a 512MB para evitar OOM
CMD ["node", "--max-old-space-size=512", "dist/main"]