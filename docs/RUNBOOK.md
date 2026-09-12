# Runbook — nasmeh.si on the home server

Operations reference for the compose stack in this repository (`docker-compose.yml`: `app` + `db`, optional `adminer`/`mailpit` under the `tools` profile). Conventions and environment variables: AGENTS.md §6. Written in Phase 9 step 3 ([record](testing/phase-9-step-3-2026-09-12.md)); the deployment itself (step 5) and the go-live checklist (step 6) add their sections when they land.

All commands run on the host, from the directory that holds `docker-compose.yml` and the host's `.env`. Production never uses `docker-compose.override.yml` (it publishes Postgres for local development): keep it out of the server checkout, and pass `-f docker-compose.yml` when in doubt.

## Deploy

```sh
git pull                                   # the tagged release
docker compose -f docker-compose.yml build # image nasmeh-app, migrations run at container start
docker compose -f docker-compose.yml up -d # app + db; the entrypoint applies prisma migrate deploy, then starts the server
curl -fsS http://127.0.0.1:${PORT:-3000}/api/health   # {"status":"ok","db":"up",...}
```

Migrations are applied on every start by the entrypoint; never run `prisma migrate dev` against the deployed database. A release that adds a migration is backed up first (below) — the dump is the rollback for the schema.

## Rollback

1. Application only (no migration in the release): `git checkout <previous tag>`, `docker compose -f docker-compose.yml build`, `docker compose -f docker-compose.yml up -d`. The old image starts against the current database.
2. Release with a migration: stop the app (`docker compose -f docker-compose.yml stop app`), restore the pre-release dump into the live database (`gunzip -c <backup>/db.sql.gz | docker compose -f docker-compose.yml exec -T db psql -U postgres -d nasmeh -v ON_ERROR_STOP=1`), then step 1. The dump is taken with `--clean --if-exists`, so it replaces the schema and the data; orders placed after the backup are lost — read the backup manifest's `orders:` line before deciding, and prefer a forward fix when the store took orders in between.
3. Media volumes are not touched by a rollback; a restore of the archives is only needed after volume loss (see the restore drill).

## Backups

`scripts/backup.sh [BACKUP_ROOT]` writes one directory per run, `BACKUP_ROOT/<YYYY-MM-DD_HHMM>/`:

| File | Content |
|---|---|
| `db.sql.gz` | `pg_dump --clean --if-exists` of `nasmeh` through the running `db` container |
| `catalog-uploads.tar.gz` | `/app/catalog-uploads` — product, collection and media-library files (public by URL) |
| `public-uploads.tar.gz` | `/app/public/uploads` — committed placeholder artwork |
| `review-uploads.tar.gz` | `/app/review-uploads` — **private** customer review photos |
| `support-uploads.tar.gz` | `/app/support-uploads` — **private** ticket photos |
| `manifest.txt` | timestamp, image id, applied migrations, order count, sizes and sha256 sums |

Retention, applied by the script on every run: the newest **14 daily** backups, older ones only when taken on a Sunday, and those for **8 weeks**; everything else is removed. Cron, once a day at 03:00 host time:

```
0 3 * * * cd /srv/nasmeh && scripts/backup.sh /srv/backups/nasmeh >> /var/log/nasmeh-backup.log 2>&1
```

Every run verifies the dump before the directory counts as a backup: the gzip stream is tested and pg_dump's own `-- PostgreSQL database dump complete` marker must be present (a `cmd | gzip > file` pipeline reports *gzip's* status, so a `pg_dump` killed mid-way would otherwise leave a truncated archive behind a zero exit). A run that fails verification removes its own directory and exits non-zero — so a **missing** dated directory, not a corrupt one, is what a failed night looks like, and the cron log holds the reason. `manifest.txt` is written last, and `restore.sh` requires it, so a run interrupted between the dump and the archives is refused rather than half-restored.

The backup root must sit on a different disk (or be synced off the host: `rclone`/`restic` to object storage, which also gives the encryption the private photos deserve). The stack stays up during the backup; `pg_dump` takes a consistent snapshot, the media archives are taken while the app may write — a file uploaded during the seconds of the archive lands in the next one.

A backup is verified by the restore drill below, monthly and before every release that adds a migration.

## Restore drill (and real restores)

`scripts/restore.sh <backup-dir> [project] [port]` brings a backup up as a **separate** compose project (default `nasmeh-restore` on port 3100) next to the live store, from the same image, with its own volumes and network:

```sh
scripts/restore.sh /srv/backups/nasmeh/2026-09-12_0300           # restored stack on http://127.0.0.1:3100
curl -fsS http://127.0.0.1:3100/api/health                        # db up
docker compose -p nasmeh-restore -f docker-compose.yml exec -T db psql -U postgres -d nasmeh -At -c 'SELECT count(*) FROM "Order"'
docker compose -p nasmeh-restore -f docker-compose.yml down -v    # when done
```

The script prints the health JSON, the migration and order counts, the file count per media directory and the number of private files found under `public/uploads` (must be 0): private photos are restored into their private volumes only and are served through the moderation-aware routes, never as public files.

The restored stack reads the **same host `.env`** as the live one (`env_file: .env`), so it comes up holding the live SMTP and payment credentials — it is a working store on port 3100, not a sandbox. Never point the scheduler or a proxy at it, do not run `/api/jobs/daily` against it, and tear it down when the drill is over. Nothing in the drill touches the live project: the restore has its own compose project name, volumes and network, and refuses to start if that project already has containers.

To promote a restored stack after a disaster: stop the live project (`docker compose -f docker-compose.yml down`), point the reverse proxy at the restored project's port (or start the live project again and restore into it: load the dump with the `psql` line from the rollback section and unpack the four archives with the `docker run --volumes-from … tar xzf` commands the script uses).

## Cron jobs

| Job | Schedule | Command |
|---|---|---|
| Daily delivery streams (confirmation and shipped-mail retries, review requests, restock alerts, ticket-mail retries) | once a day, e.g. 06:00 | `curl -fsS -X POST -H "Authorization: Bearer $JOBS_SECRET" https://nasmeh.si/api/jobs/daily` |
| Backup | 03:00 | `scripts/backup.sh` (above) |

`JOBS_SECRET` lives in the host's `.env`; the job answers 401 without it. Both jobs log to files the host rotates with `logrotate`.

## Monitoring

- **Health endpoint:** `GET /api/health` answers `200 {"status":"ok","db":"up","uptime":<s>,"memory":{"rssMb","heapUsedMb"},"node"}` when the app reaches Postgres and `503 {"status":"error","db":"down",…}` when it does not; `Cache-Control: no-store`. The Docker `HEALTHCHECK` calls it every 30 s and needs three consecutive failures, so the container is marked `unhealthy` roughly 90 s into an outage (measured in the step 3 drill). Docker does **not** restart an unhealthy container — `unless-stopped` acts only when the process exits — so the checker below is what pages a human.
- **Uptime checker:** point an HTTP monitor at `https://nasmeh.si/api/health` every 60 s, expecting status 200 **and** the keyword `"db":"up"` (a keyword check catches the 503 body even when a proxy rewrites the status), alert after 2 consecutive failures. Self-hosted: Uptime Kuma on the same host (`louislam/uptime-kuma`, its own compose project, notification to Telegram or e-mail); hosted: UptimeRobot / Better Stack keyword monitor. The alert route is the store owner's phone (Telegram) plus e-mail; the escalation is this runbook's *Incidents* section.
- **Process metrics:** the health JSON's `memory.rssMb` (container limit 512 MB in compose) and `uptime` (unexpected resets = crashes); the checker keeps the history. `docker stats --no-stream` on the host for CPU.
- **Logs:** both containers log to Docker's `json-file` driver with rotation (`max-size 10m`, `max-file 5` — at most 50 MB per container). `docker compose -f docker-compose.yml logs --tail 200 app`. The app's own lines worth grepping: `[csp]` (policy reports, Phase 9 step 1), `[auth]`, `[jobs]`, `[entrypoint]`.
- **Error tracking:** no third-party tracker before launch (no PII leaves the host); the CSP report sink and the server log are the sources. Revisit after go-live (Phase 8 growth backlog).

## Incidents

| Symptom | Check | Action |
|---|---|---|
| Health 503 `db: down` | `docker compose -f docker-compose.yml ps` — is `db` up? `docker compose logs db` | `docker compose -f docker-compose.yml up -d db`; the app reconnects by itself (Prisma pool). Disk full → free space, then restart `db`. |
| Health unreachable (connection refused) | `docker compose ps` — app restarting? `docker compose logs --tail 100 app` | Entrypoint refusals (media guard, migration failure) are printed first; fix the cause, `up -d app`. |
| Site up, orders not confirmed by mail | `docker compose logs app | grep -i mail`, the daily job's last run | Mail retries ride the daily job; run it by hand with the `curl` line above. |
| Store in maintenance unexpectedly | admin → Nastavitve → Trženje (maintenance switch) | Disable; the password hash never unlocks by itself. |
| Restore needed | latest backup manifest | Restore drill section; promote when verified. |

Forced-failure drill (part of the step 3 record): `docker compose -f docker-compose.yml stop db` → `/api/health` turns `503 db: down` on the very next check → the checker alerts after two consecutive failures → `docker compose -f docker-compose.yml start db` → health reads `db: up` again on the first check once Postgres accepts connections. The app is never restarted: its `uptime` keeps climbing across the outage and its restart count stays 0, because the Prisma pool reconnects by itself. Measured 2026-09-12 — commands and output in the [step 3 record](testing/phase-9-step-3-2026-09-12.md).
