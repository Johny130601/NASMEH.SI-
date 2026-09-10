# syntax=docker/dockerfile:1

# ---------- deps: full node_modules incl. generated Prisma client ----------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund --maxsockets=10

# ---------- builder: Next.js standalone output ----------
FROM node:20-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# ---------- runner: slim, non-root, standalone ----------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Prisma CLI for `migrate deploy` at container start (matches @prisma/client major)
RUN npm install -g prisma@6 --no-audit --no-fund && npm cache clean --force

COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/prisma ./prisma
# Generated Prisma client + query engines are not fully traced into standalone
COPY --from=builder --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=node:node /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=node:node /app/docker-entrypoint.sh ./docker-entrypoint.sh
COPY --from=builder --chown=node:node /app/scripts/migrate-review-uploads.cjs ./scripts/migrate-review-uploads.cjs

# A fresh named upload volume inherits these placeholders and node ownership.
# Customer uploads then survive image/container replacement.
RUN mkdir -p /app/public/uploads && chown node:node /app/public/uploads
RUN mkdir -p /app/review-uploads && chown node:node /app/review-uploads
RUN mkdir -p /app/support-uploads && chown node:node /app/support-uploads
RUN mkdir -p /app/catalog-uploads && chown node:node /app/catalog-uploads

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -q --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
