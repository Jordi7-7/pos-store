# --- Build Stage ---
FROM node:24-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --config.strict-dep-builds=false

COPY . .
RUN pnpm run build

# Descartar devDependencies antes de pasar a la etapa final
RUN pnpm prune --prod

# --- Production Stage ---
FROM node:24-alpine AS runner
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile --config.strict-dep-builds=false

COPY --from=builder /app/dist ./dist

# Limitar memoria de V8 a 384MB para evitar OOM
CMD ["node", "--max-old-space-size=512", "dist/main"]