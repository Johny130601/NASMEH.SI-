#!/bin/sh
# Restore a scripts/backup.sh directory into a FRESH compose project (Phase 9 step 3).
#
#   scripts/restore.sh <backup-dir> [project] [port]
#     project  compose project name for the restored stack, default nasmeh-restore
#     port     host port for the restored app, default 3100 (the live store keeps its own)
#
# The restored stack runs next to the live one with its own volumes and network, from the
# image the live stack runs (compose `image: nasmeh-app`, no rebuild). Steps: create the
# project without starting it (so compose owns the volumes), start db, load the dump,
# unpack the four media archives into their volumes, start app, wait for /api/health.
# Private review and ticket photos go back into their private volumes only — never into
# public/uploads. When the drill is over: docker compose -p <project> -f docker-compose.yml down -v
#
# Environment: COMPOSE_FILE (default docker-compose.yml), DB_NAME (nasmeh), DB_USER (postgres).
set -eu

# Git Bash/MSYS on Windows rewrites container-absolute arguments (/app/… becomes
# C:/Program Files/Git/app/…) before they reach docker; the drill runs there. No effect on Linux.
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL="*"

BACKUP_DIR=${1:?usage: scripts/restore.sh <backup-dir> [project] [port]}
PROJECT=${2:-nasmeh-restore}
PORT=${3:-3100}
COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.yml}
DB_NAME=${DB_NAME:-nasmeh}
DB_USER=${DB_USER:-postgres}

compose() { PORT="$PORT" docker compose -p "$PROJECT" -f "$COMPOSE_FILE" "$@"; }
log() { printf '[restore %s] %s\n' "$(date +%H:%M:%S)" "$*"; }

# manifest.txt is written last by backup.sh, so requiring it rejects a half-written backup
# (a run killed between the dump and the archives) instead of restoring a partial store.
for f in db.sql.gz catalog-uploads.tar.gz public-uploads.tar.gz review-uploads.tar.gz support-uploads.tar.gz manifest.txt; do
  [ -f "$BACKUP_DIR/$f" ] || { echo "restore: $BACKUP_DIR/$f missing" >&2; exit 2; }
done
[ -f "$COMPOSE_FILE" ] || { echo "restore: $COMPOSE_FILE not found — run from the compose directory" >&2; exit 2; }
if [ -n "$(compose ps -q 2>/dev/null)" ]; then echo "restore: project $PROJECT already has containers — remove it first (down -v)" >&2; exit 2; fi

log "creating project $PROJECT (port $PORT) without starting it"
compose up --no-start --no-build
log "starting db"
compose up -d --no-build db --wait
log "loading $BACKUP_DIR/db.sql.gz"
gunzip -c "$BACKUP_DIR/db.sql.gz" | compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" -q -v ON_ERROR_STOP=1 > /dev/null

APP_ID=$(compose ps -q -a app)
for pair in catalog-uploads:/app/catalog-uploads public-uploads:/app/public/uploads review-uploads:/app/review-uploads support-uploads:/app/support-uploads; do
  name=${pair%%:*}; dir=${pair#*:}
  log "unpacking $name.tar.gz → $dir"
  docker run --rm -i --volumes-from "$APP_ID" alpine:3.20 sh -c "mkdir -p '$dir' && tar xzf - -C '$dir' && chown -R 1000:1000 '$dir'" < "$BACKUP_DIR/$name.tar.gz"
done

log "starting app"
compose up -d --no-build app
log "waiting for http://127.0.0.1:$PORT/api/health"
attempt=0
until curl -fsS "http://127.0.0.1:$PORT/api/health" | grep -q '"db":"up"'; do
  attempt=$((attempt + 1))
  [ "$attempt" -ge 60 ] && { echo "restore: app not healthy after 60 attempts" >&2; compose logs --tail 30 app >&2; exit 1; }
  sleep 2
done

log "restored stack summary"
echo "  health:     $(curl -fsS "http://127.0.0.1:$PORT/api/health")"
echo "  migrations: $(compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" -At -c 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL')"
echo "  orders:     $(compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" -At -c 'SELECT count(*) FROM "Order"')"
for dir in /app/catalog-uploads /app/public/uploads /app/review-uploads /app/support-uploads; do
  echo "  $dir: $(compose exec -T app sh -c "find $dir -type f | wc -l | tr -d ' '") file(s)"
done
echo "  private files under public/uploads: $(compose exec -T app sh -c "find /app/public/uploads -path '*/reviews/*' -o -path '*/support/*' | wc -l | tr -d ' '") (must be 0)"
log "done — tear down with: docker compose -p $PROJECT -f $COMPOSE_FILE down -v"
