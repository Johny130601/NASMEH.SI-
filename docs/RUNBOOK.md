# Runbook — nasmeh.si on the home server

Operations reference for the compose stack in this repository (`docker-compose.yml`: `app` + `db`, optional `adminer`/`mailpit` under the `tools` profile). Conventions and environment variables: AGENTS.md §6. Written in Phase 9 step 3 ([record](testing/phase-9-step-3-2026-09-12.md)); the host section came with step 5 ([record](testing/phase-9-step-5-2026-09-15.md)); release tags and the go-live section with step 6 ([record](testing/phase-9-step-6-2026-09-15.md), [checklist](testing/go-live-checklist.md)).

All commands run on the host, from the directory that holds `docker-compose.yml` and the host's `.env`. Production never uses `docker-compose.override.yml` (it publishes Postgres for local development): keep it out of the server checkout, and pass `-f docker-compose.yml` on **every** command that touches the stack — compose merges the override silently whenever the file exists, and a bare `docker compose up -d app` would recreate `db` with a published port.

## Host

The shape below was rehearsed on the workstation on 2026-09-15 — the production project and a staging project behind a TLS-terminating nginx on a shared docker network, both from fresh databases ([step 5 record](testing/phase-9-step-5-2026-09-15.md)). The host runs exactly this; only the hostnames, certificates and secrets differ.

### Prerequisites

- Docker Engine with Compose v2, and the existing reverse proxy (Traefik or nginx) with a docker network the app can join: `docker network create proxy` when it has none, and its name in `.env` as `PROXY_NETWORK`.
- DNS for `nasmeh.si` (and `staging.nasmeh.si`) pointing at the host; certificates at the proxy (Let's Encrypt through Traefik or certbot). The app serves plain HTTP inside the network and sends every security header except HSTS, which the proxy adds.
- A checkout of the tagged release (say `/srv/nasmeh`) without `docker-compose.override.yml`, and the host `.env` next to it.

### The host `.env`

| Variable | Production value |
|---|---|
| `PORT` | a free host port; the app is published on `127.0.0.1:PORT` only, the proxy reaches it over the network |
| `PROXY_NETWORK` | the proxy's docker network (default `proxy`) |
| `IMAGE_TAG` | the release the stack runs (`nasmeh-app:<tag>`); `latest` on the first build, then the git short sha the deploy writes — without the line, `up -d` starts the last untagged build |
| `ENV_FILE` | the file the app container loads (compose `env_file`); absent or `.env` on the host, `.env.staging` **inside `.env.staging`** — see Staging |
| `NEXT_PUBLIC_SITE_URL`, `AUTH_URL` | `https://nasmeh.si` — read at request time, never baked into the image: every absolute link (sitemap, canonicals, mails, coupon links, PDF links) and every auth callback comes from here |
| `AUTH_SECRET`, `JOBS_SECRET` | long random strings (`openssl rand -base64 48`), different on staging |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | the owner's address and a strong one-time password for the first start (below); after the first sign-in delete the password line **or** leave it empty — both count as removed, and the existing OWNER is never touched again |
| `DATABASE_URL` | keep the example value: compose wires the app to the `db` container itself |
| `STRIPE_*`, `PAYPAL_*`, `SMTP_*`, `EMAIL_FROM`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | the live credentials (step 6); staging keeps test keys |
| `CSP_ENFORCE` | `false` until a full browser pass on the host logs no `[csp]` lines, then `true` (no rebuild) |
| `NASMEH_E2E`, `TURNSTILE_TEST_TOKEN` | never set on a host |

### First start (empty database)

```sh
docker network create proxy                                              # once, unless the proxy already owns one
docker compose -f docker-compose.yml -f docker-compose.proxy.yml build
docker compose -f docker-compose.yml -f docker-compose.proxy.yml up -d
docker compose -f docker-compose.yml logs app | grep -E "\[entrypoint\]|\[bootstrap\]"
curl -fsS http://127.0.0.1:${PORT:-3000}/api/health
```

The entrypoint applies the migrations; the last of them insert the six legal pages as published, unreviewed drafts when they are missing. The server then creates the OWNER account from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` when the database has none (`[bootstrap] OWNER account created …` in the log; in production the `.env.example` password is refused and the log says so — fix `.env` and restart). Sign in at `https://nasmeh.si/prijava`, enrol the second factor, remove `SEED_ADMIN_PASSWORD` from `.env`, then enter the company data, shipping methods, support mailboxes and the index/maintenance switches under `/admin/nastavitve` and the catalogue under `/admin/izdelki`. Never run `npm run db:seed` against a host database: it writes the demo catalogue, coupons and price history.

### Reverse proxy

nginx in a container on the proxy network (the block the rehearsal ran, without the port and the self-signed certificate):

```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name nasmeh.si;
    ssl_certificate     /etc/letsencrypt/live/nasmeh.si/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/nasmeh.si/privkey.pem;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;  # HSTS lives here
    client_max_body_size 12m;     # four review photos at 2 MB plus multipart overhead (bodySizeLimit 10mb)
    proxy_read_timeout 60s;
    resolver 127.0.0.11 valid=10s ipv6=off;   # resolve the container at request time, so nginx survives a recreate
    location / {
        set $upstream http://nasmeh-app-1:3000;   # compose container name: <project>-app-1
        proxy_pass $upstream;
        proxy_http_version 1.1;
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;   # OVERWRITE, never $proxy_add_x_forwarded_for
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $http_host;
    }
}
server { listen 80; server_name nasmeh.si; return 301 https://$host$request_uri; }
```

The proxy **must overwrite** both `X-Real-IP` and `X-Forwarded-For` with the address it sees: nginx's `$proxy_add_x_forwarded_for` *appends* to whatever the client sent, so a client that sends its own `X-Forwarded-For` picks the address the app reads and rotates every rate-limit bucket at will (login attempts, coupon-link lookups, the unlock gate). This proxy is the only hop in front of the app, so there is nothing to preserve.

An nginx installed on the host itself proxies to `http://127.0.0.1:PORT` instead and needs no `resolver` line (and no proxy compose file).

Traefik: labels on the `app` service, in a `docker-compose.traefik.yml` layered like the proxy file (or the same routes in Traefik's file provider):

```yaml
services:
  app:
    labels:
      traefik.enable: "true"
      traefik.docker.network: ${PROXY_NETWORK:-proxy}
      traefik.http.routers.nasmeh.rule: Host(`nasmeh.si`)
      traefik.http.routers.nasmeh.entrypoints: websecure
      traefik.http.routers.nasmeh.tls.certresolver: letsencrypt
      traefik.http.services.nasmeh.loadbalancer.server.port: "3000"
      traefik.http.middlewares.nasmeh-hsts.headers.stsSeconds: "31536000"
      traefik.http.middlewares.nasmeh-hsts.headers.stsIncludeSubdomains: "true"
      traefik.http.routers.nasmeh.middlewares: nasmeh-hsts
```

Traefik overwrites the forwarded headers by itself as long as the entrypoint keeps its default empty `forwardedHeaders.trustedIPs` (and no `insecure: true`): with a trusted-IP list it *preserves* what the client sent, which is exactly what must not happen here.

The app takes none of its own URLs from the proxy headers (`NEXT_PUBLIC_SITE_URL` and `AUTH_URL` decide, redirects stay on the request origin), so a misconfigured proxy cannot send users elsewhere. `X-Forwarded-For` / `X-Real-IP` are the client address the rate limits are counted per, so a proxy that lets a client's own value through hands every attacker a fresh bucket per request — overwrite both, as above.

### Staging

Same image, a second compose project with its own `.env.staging` (`PORT=3001`, `NEXT_PUBLIC_SITE_URL`/`AUTH_URL` `https://staging.nasmeh.si`, its own `AUTH_SECRET`/`JOBS_SECRET`, test payment keys) — and an `ENV_FILE=.env.staging` line of its own:

```sh
grep -qx 'ENV_FILE=.env.staging' .env.staging || { sed -i '/^ENV_FILE=/d' .env.staging; echo 'ENV_FILE=.env.staging' >> .env.staging; }  # a copied .env carries ENV_FILE=.env: check the value, not the key
docker compose -p nasmeh-staging --env-file .env.staging -f docker-compose.yml -f docker-compose.proxy.yml up -d
scripts/launch-check.sh https://staging.nasmeh.si --staging     # the origin rows prove which .env the container loaded
```

`--env-file` only supplies the values compose interpolates (`PORT`, `PROXY_NETWORK`, `IMAGE_TAG`, `ENV_FILE`); the file the *container* reads is the compose `env_file` entry, `${ENV_FILE:-.env}`. Without the `ENV_FILE` line staging comes up on production's `.env`: the production origin in every canonical, sitemap and auth callback, the production `AUTH_SECRET`/`JOBS_SECRET`, and a "test checkout" that creates **live** PaymentIntents. The launch check's origin rows are what catches it.

The proxy reaches it as `nasmeh-staging-app-1:3000` under `staging.nasmeh.si`. After the first sign-in switch **maintenance mode on** (with a password for reviewers) and **indexing off** on `/admin/nastavitve/trzenje`: robots.txt then disallows everything, every page carries noindex, the sitemap shrinks to the homepage and instant search answers nothing, while `/prijava`, `/admin` and the consent links stay reachable. A locked read is redirected to the gate at `/vzdrzevanje?od=<the address asked for>` (the unlock sends the visitor back there), and every non-GET request outside the allow-list is answered `503`, so the storefront's own Server Actions (add to cart, checkout, place order) are no longer reachable at the address they are invoked from. They are not *unreachable*: a Next-Action id is dispatched from the global action manifest whatever the path, so a POST aimed at one of the allow-listed paths still runs the action it names. The gate is a wall against visitors and crawlers, not an authorization boundary — staging still needs its own database, its own secrets and test payment keys. Preview links are the storefront itself behind the password. Staging owns its volumes (`nasmeh-staging_*`) and database — nothing is shared with production — and gets no daily-job cron.

## Deploy

```sh
git pull                                                                          # the tagged release
NEW=$(git rev-parse --short HEAD)
IMAGE_TAG=$NEW docker compose -f docker-compose.yml -f docker-compose.proxy.yml build # builds and tags nasmeh-app:$NEW
grep -q '^IMAGE_TAG=' .env || echo "IMAGE_TAG=" >> .env                               # without the key the sed below is a silent no-op and `up -d` starts nasmeh-app:latest, the last untagged build
sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$NEW/" .env                                        # the release the stack runs
docker compose -f docker-compose.yml -f docker-compose.proxy.yml up -d              # app + db; the entrypoint applies prisma migrate deploy, then starts the server
curl -fsS http://127.0.0.1:${PORT:-3000}/api/health                               # {"status":"ok","db":"up",...}
docker images nasmeh-app                                                          # the releases kept for rollback; prune old ones with docker rmi
```

The proxy file only adds the network; `backup.sh`, `restore.sh` and every `exec` below work with `-f docker-compose.yml` alone, and `restore.sh` restores with the release named in `.env` (`IMAGE_TAG=<other> scripts/restore.sh …` to restore with another one). Keep the last few release tags; a build without `IMAGE_TAG=` would overwrite the tag `.env` names, so always build with the new tag set.

Migrations are applied on every start by the entrypoint; never run `prisma migrate dev` against the deployed database. A release that adds a migration is backed up first (below) — the dump is the rollback for the schema.

## Rollback

1. Application only (no migration in the release): put the previous release tag into `.env` (`sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=<previous>/" .env`, the tags are listed by `docker images nasmeh-app`) and `docker compose -f docker-compose.yml -f docker-compose.proxy.yml up -d`. No rebuild, no checkout: the previous image starts against the current database within seconds. (Rehearsed in the step 6 record: a tagged image started without a build.)
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

The restored stack reads the **same host `.env`** as the live one (`env_file: ${ENV_FILE:-.env}`, and the drill passes no `--env-file`), so it comes up holding the live SMTP and payment credentials — it is a working store on port 3100, not a sandbox. Never point the scheduler or a proxy at it, do not run `/api/jobs/daily` against it, and tear it down when the drill is over. Nothing in the drill touches the live project: the restore has its own compose project name, volumes and network, and refuses to start if that project already has containers.

To promote a restored stack after a disaster: stop the live project (`docker compose -f docker-compose.yml down`), point the reverse proxy at the restored project's port (or start the live project again and restore into it: load the dump with the `psql` line from the rollback section and unpack the four archives with the `docker run --volumes-from … tar xzf` commands the script uses).

## Cron jobs

| Job | Schedule | Command |
|---|---|---|
| Daily delivery streams (confirmation and shipped-mail retries, review requests, restock alerts, ticket-mail retries) and the retention job | once a day, e.g. 06:00 | `curl -fsS -X POST -H "Authorization: Bearer $JOBS_SECRET" http://127.0.0.1:${PORT}/api/jobs/daily` (loopback: no DNS or TLS in the path; production only, staging gets no cron) |
| Backup | 03:00 | `scripts/backup.sh` (above) |

`JOBS_SECRET` lives in the host's `.env`; the job answers 401 without it and with another project's secret. Both jobs log to files the host rotates with `logrotate`; a crontab line that uses `$JOBS_SECRET` and `$PORT` reads them from `.env` first (`set -a; . /srv/nasmeh/.env; set +a`).

## Monitoring

- **Health endpoint:** `GET /api/health` answers `200 {"status":"ok","db":"up","uptime":<s>,"memory":{"rssMb","heapUsedMb"},"node"}` when the app reaches Postgres and `503 {"status":"error","db":"down",…}` when it does not; `Cache-Control: no-store`. The Docker `HEALTHCHECK` calls it every 30 s and needs three consecutive failures, so the container is marked `unhealthy` roughly 90 s into an outage (measured in the step 3 drill). Docker does **not** restart an unhealthy container — `unless-stopped` acts only when the process exits — so the checker below is what pages a human.
- **Uptime checker:** point an HTTP monitor at `https://nasmeh.si/api/health` every 60 s, expecting status 200 **and** the keyword `"db":"up"` (a keyword check catches the 503 body even when a proxy rewrites the status), alert after 2 consecutive failures. Self-hosted: Uptime Kuma on the same host (`louislam/uptime-kuma`, its own compose project, notification to Telegram or e-mail); hosted: UptimeRobot / Better Stack keyword monitor. The alert route is the store owner's phone (Telegram) plus e-mail; the escalation is this runbook's *Incidents* section.
- **Process metrics:** the health JSON's `memory.rssMb` (container limit 512 MB in compose) and `uptime` (unexpected resets = crashes); the checker keeps the history. `docker stats --no-stream` on the host for CPU.
- **Logs:** both containers log to Docker's `json-file` driver with rotation (`max-size 10m`, `max-file 5` — at most 50 MB per container). `docker compose -f docker-compose.yml logs --tail 200 app`. The app's own lines worth grepping: `[csp]` (policy reports, Phase 9 step 1), `[auth]`, `[jobs]`, `[entrypoint]`.
- **Error tracking:** no third-party tracker before launch (no PII leaves the host); the CSP report sink and the server log are the sources. Revisit after go-live (Phase 8 growth backlog).

## Data-subject requests (GDPR)

Requests arrive by e-mail at the support mailbox (`support.contact`); the privacy policy promises an answer within one month (GDPR Art. 12(3)). Never act on a request from an address the store does not know: reply to the address on file (account, subscriber or order e-mail) and ask the person to confirm from it.

1. **Find the person** in `/admin/stranke` (search by e-mail). Guests, newsletter-only and ticket-only subjects resolve through the guest page (`/admin/stranke/gost?email=…`). The next two steps need `customers:gdpr` (OWNER, SUPPORT).
2. **Access and portability (Art. 15, 20):** the export link on the customer page downloads one JSON document: profile, addresses, cart, orders, reviews, tickets (attachment metadata), subscriptions, back-in-stock rows, checkout captures, coupon redemptions and consent records. Send it to the confirmed address.
3. **Erasure (Art. 17):** the anonymise action replaces e-mail, name, password, addresses, tokens, cart, subscriptions and checkout captures, scrubs ticket deliveries and notes that quote the address, appends a marketing withdrawal when the person was opted in, and keeps what the law or proof needs: order financials, the issued invoice snapshot, the accepted legal texts, consent records and review content. Settle open orders (unpaid, unshipped, refund pending) first; the action cannot be undone.
4. **Rectification (Art. 16):** no staff tool at P1. The customer changes the address book in the account; anything else is fixed with a database console and noted in the ticket.
5. **Record** the request, the identity check and the completion date in a support ticket (create one from the e-mail when none exists).

Backups keep erased data for up to 14 daily and 8 weekly copies (see Backups); after a restore, re-apply every anonymisation done since the backup was taken. `scripts/consent-audit.sql` (read-only) checks the consent log on demand.

## Go-live

[docs/testing/go-live-checklist.md](testing/go-live-checklist.md) is the launch document: every item of sections A–E carries its verification and an evidence cell, and the sign-off block records the release tag, the legal and accountant sign-offs, the €1 order and the owner's decision. `scripts/launch-check.sh https://nasmeh.si` (and `… https://staging.nasmeh.si --staging`) produces the HTTP evidence in one run — health, HSTS, CSP mode, security headers, maintenance and index switches, robots and sitemap on the public origin, product pages present, the six legal pages without the draft notice, the company data behind the withdrawal PDF and the footer, the admin gate and the job route — and exits with the number of open items. Run it before the switch (expect the D2/D4/G4 rows to fail until those gates are passed), after it (exit 0), and after `CSP_ENFORCE=true`.

## Incidents

| Symptom | Check | Action |
|---|---|---|
| Health 503 `db: down` | `docker compose -f docker-compose.yml ps` — is `db` up? `docker compose -f docker-compose.yml logs db` | `docker compose -f docker-compose.yml up -d db`; the app reconnects by itself (Prisma pool). Disk full → free space, then restart `db`. |
| Health unreachable (connection refused) | `docker compose -f docker-compose.yml ps` — app restarting? `docker compose -f docker-compose.yml logs --tail 100 app` | Entrypoint refusals (media guard, migration failure) are printed first; fix the cause, `docker compose -f docker-compose.yml up -d app`. |
| Site up, orders not confirmed by mail | `docker compose -f docker-compose.yml logs app | grep -i mail`, the daily job's last run | Mail retries ride the daily job; run it by hand with the `curl` line above. |
| Store in maintenance unexpectedly | admin → Nastavitve → Trženje (maintenance switch) | Disable; the password hash never unlocks by itself. |
| Restore needed | latest backup manifest | Restore drill section; promote when verified. |

Forced-failure drill (part of the step 3 record): `docker compose -f docker-compose.yml stop db` → `/api/health` turns `503 db: down` on the very next check → the checker alerts after two consecutive failures → `docker compose -f docker-compose.yml start db` → health reads `db: up` again on the first check once Postgres accepts connections. The app is never restarted: its `uptime` keeps climbing across the outage and its restart count stays 0, because the Prisma pool reconnects by itself. Measured 2026-09-12 — commands and output in the [step 3 record](testing/phase-9-step-3-2026-09-12.md).
