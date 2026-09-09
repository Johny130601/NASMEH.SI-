#!/bin/sh
set -e

echo "[entrypoint] securing legacy review media…"
node scripts/migrate-review-uploads.cjs

echo "[entrypoint] applying database migrations (prisma migrate deploy)…"
npx prisma migrate deploy

echo "[entrypoint] starting Next.js standalone server…"
exec node server.js
