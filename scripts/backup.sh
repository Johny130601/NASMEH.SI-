#!/bin/sh
# Nightly backup of the production compose stack (Phase 9 step 3; AGENTS.md §6).
#
#   scripts/backup.sh [BACKUP_ROOT]        default BACKUP_ROOT=./backups
#
# Writes BACKUP_ROOT/<YYYY-MM-DD_HHMM>/ with
#   db.sql.gz                 pg_dump of the `nasmeh` database through the running db container
#   catalog-uploads.tar.gz    /app/catalog-uploads   (product, collection and library media)
#   public-uploads.tar.gz     /app/public/uploads    (committed placeholder artwork)
#   review-uploads.tar.gz     /app/review-uploads    (PRIVATE customer review photos)
#   support-uploads.tar.gz    /app/support-uploads   (PRIVATE ticket photos)
#   manifest.txt              sizes, sha256 sums, image id, migration count
# and applies the retention documented in docs/RUNBOOK.md: the newest 14 daily backups
# are kept, older ones only when taken on a Sunday, and those for 8 weeks.
#
# Host cron (root or the docker group), once a day, from the compose directory:
#   0 3 * * * cd /srv/nasmeh && scripts/backup.sh /srv/backups/nasmeh >> /var/log/nasmeh-backup.log 2>&1
#
# Environment: COMPOSE_FILE (default docker-compose.yml — never the dev override),
# COMPOSE_PROJECT (default: the `name:` in the compose file, nasmeh), DB_NAME (nasmeh),
# DB_USER (postgres), KEEP_DAILY (14), KEEP_WEEKLY (8).
set -eu

# Git Bash/MSYS on Windows rewrites container-absolute arguments (/app/… becomes
# C:/Program Files/Git/app/…) before they reach docker; the drill runs there. No effect on Linux.
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL="*"

BACKUP_ROOT=${1:-./backups}
COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.yml}
COMPOSE_PROJECT=${COMPOSE_PROJECT:-nasmeh}
DB_NAME=${DB_NAME:-nasmeh}
DB_USER=${DB_USER:-postgres}
KEEP_DAILY=${KEEP_DAILY:-14}
KEEP_WEEKLY=${KEEP_WEEKLY:-8}
STAMP=$(date +%Y-%m-%d_%H%M)
TARGET="$BACKUP_ROOT/$STAMP"

compose() { docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" "$@"; }
log() { printf '[backup %s] %s\n' "$(date +%H:%M:%S)" "$*"; }

if [ ! -f "$COMPOSE_FILE" ]; then echo "backup: $COMPOSE_FILE not found — run from the compose directory" >&2; exit 2; fi
APP_ID=$(compose ps -q app)
DB_ID=$(compose ps -q db)
if [ -z "$APP_ID" ] || [ -z "$DB_ID" ]; then echo "backup: the app and db containers must be running (project $COMPOSE_PROJECT)" >&2; exit 2; fi

mkdir -p "$TARGET"
log "database → $TARGET/db.sql.gz"
# --clean --if-exists lets restore.sh load the dump into a freshly migrated or an empty database alike.
compose exec -T db pg_dump -U "$DB_USER" --clean --if-exists "$DB_NAME" | gzip -6 > "$TARGET/db.sql.gz"
# `cmd | gzip > file` exits with gzip's status, so a pg_dump killed mid-dump (disk full, the db
# container going away) would leave a truncated archive behind a zero exit — and the retention
# below would eventually rotate the last good backup away. Verify the stream and pg_dump's own
# end marker before this directory is allowed to count as a backup.
gunzip -t "$TARGET/db.sql.gz"
# pg_dump 16.10+ writes a `\unrestrict <token>` trailer after the completion marker, so the
# marker is a few lines from the end rather than the last line — read a window, not tail -1.
gunzip -c "$TARGET/db.sql.gz" | tail -20 | grep -q "PostgreSQL database dump complete" \
  || { echo "backup: pg_dump did not finish — $TARGET is incomplete, removing" >&2; rm -rf "$TARGET"; exit 1; }

# Media volumes, read through the app container's mounts so the volume names never matter.
# The archives keep the directory contents only (no leading path), one per volume, so a
# restore can put each one back where it belongs and the private ones never land in public/.
for pair in catalog-uploads:/app/catalog-uploads public-uploads:/app/public/uploads review-uploads:/app/review-uploads support-uploads:/app/support-uploads; do
  name=${pair%%:*}; dir=${pair#*:}
  log "$dir → $TARGET/$name.tar.gz"
  docker run --rm --volumes-from "$APP_ID" alpine:3.20 tar czf - -C "$dir" . > "$TARGET/$name.tar.gz"
done

{
  echo "created: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "project: $COMPOSE_PROJECT ($COMPOSE_FILE)"
  echo "image: $(docker inspect --format '{{.Image}}' "$APP_ID")"
  echo "migrations: $(compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" -At -c 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL')"
  echo "orders: $(compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" -At -c 'SELECT count(*) FROM "Order"')"
  echo "files:"
  (cd "$TARGET" && for f in *.gz; do printf '  %s %s bytes sha256=%s\n' "$f" "$(wc -c < "$f" | tr -d ' ')" "$(sha256sum "$f" | cut -d' ' -f1)"; done)
} > "$TARGET/manifest.txt"
log "manifest:"; sed 's/^/  /' "$TARGET/manifest.txt"

# Retention: keep the newest KEEP_DAILY directories; among the older ones keep Sunday backups for KEEP_WEEKLY weeks.
count=0; sundays=0
for dir in $(ls -1d "$BACKUP_ROOT"/????-??-??_???? 2>/dev/null | sort -r); do
  count=$((count + 1))
  [ "$count" -le "$KEEP_DAILY" ] && continue
  day=$(basename "$dir" | cut -c1-10)
  weekday=$(date -d "$day" +%u 2>/dev/null || date -j -f %Y-%m-%d "$day" +%u)
  if [ "$weekday" = "7" ] && [ "$sundays" -lt "$KEEP_WEEKLY" ]; then sundays=$((sundays + 1)); continue; fi
  log "retention: removing $dir"
  rm -rf "$dir"
done
log "done: $TARGET"
