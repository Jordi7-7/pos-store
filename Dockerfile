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
COPY package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Limitar memoria de V8 a 512MB para evitar OOM
CMD ["node", "--max-old-space-size=512", "dist/main"]