#!/bin/sh
# `next start` doesn't support output:"standalone" — assemble the standalone
# dir the same way the Dockerfile does, then run its server.
set -e

if [ ! -f .next/standalone/server.js ]; then
  echo "No .next/standalone build found — run \`npm run build\` first." >&2
  exit 1
fi

# Guard both the source tree and any stale standalone public copies before
# Next inventories public files (which would bypass the protected media route).
NASMEH_PROJECT_DIR=$(pwd)
node scripts/migrate-review-uploads.cjs "$NASMEH_PROJECT_DIR/public" "$NASMEH_PROJECT_DIR/review-uploads"
node scripts/migrate-review-uploads.cjs "$NASMEH_PROJECT_DIR/.next/standalone/public" "$NASMEH_PROJECT_DIR/review-uploads"

mkdir -p .next/standalone/public .next/standalone/.next/static
cp -R public/. .next/standalone/public/
cp -R .next/static/. .next/standalone/.next/static/

# Private review media survives local production rebuilds. Requests pass
# through the moderation-aware route instead of Next's public file server.
if [ -L .next/standalone/review-uploads ]; then
  if [ "$(readlink .next/standalone/review-uploads)" != "$NASMEH_PROJECT_DIR/review-uploads" ]; then
    echo "[review-media] unexpected standalone storage link; refusing startup" >&2
    exit 1
  fi
elif [ -e .next/standalone/review-uploads ]; then
  echo "[review-media] standalone storage is not the persistent project link; refusing startup" >&2
  exit 1
else
  ln -s "$NASMEH_PROJECT_DIR/review-uploads" .next/standalone/review-uploads
fi

# Contact attachments use their own private persistent directory.
mkdir -p "$NASMEH_PROJECT_DIR/support-uploads"
if [ -L .next/standalone/support-uploads ]; then
  if [ "$(readlink .next/standalone/support-uploads)" != "$NASMEH_PROJECT_DIR/support-uploads" ]; then
    echo "[support-media] unexpected standalone storage link; refusing startup" >&2
    exit 1
  fi
elif [ -e .next/standalone/support-uploads ]; then
  echo "[support-media] standalone storage is not the persistent project link; refusing startup" >&2
  exit 1
else
  ln -s "$NASMEH_PROJECT_DIR/support-uploads" .next/standalone/support-uploads
fi

exec node .next/standalone/server.js
