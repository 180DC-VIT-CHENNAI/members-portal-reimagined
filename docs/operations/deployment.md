# Deployment — 180DC VIT Chennai Platform

## Environments

### Void portal rollout

`apps/portal` is a separate blank-data deployment on `180dc-portal`, delivered by `.github/workflows/portal-ci.yml` after PRs merge to origin main. The old Worker and custom domain remain in place until the final cutover. Do not copy old database rows or R2 objects for this launch.

Email is scheduled by `apps/portal/crons/email.ts` every minute and sent through Cloudflare Email Sending using the `SEND_EMAIL` binding in `apps/portal/void.config.ts`; no secrets are involved (ADR-008). `180dc.vitcc.org` is onboarded as a sending subdomain on the `vitcc.org` zone (`cf email-sending subdomains list --zone vitcc.org`), and the account's Workers Paid plan allows any recipient (3,000 messages a month included, then $0.35 per 1,000). `EMAIL_HOURLY_LIMIT` optionally overrides the self-imposed 500/hour cap. Because `email.from` is unset, `void deploy` keeps the authored binding and changes no email routing or DNS. If the subdomain ever stops being enabled for sending, sends return `INVALID_FROM`, which pauses direct mail and campaigns instead of failing recipients.

`EMAIL_TEST_MODE` is a local-test setting only; never provision it on the deployed Worker. Production builds disable capture regardless of its value, and the `.dev.ts` outbox/drain routes are excluded. `ENVIRONMENT=production` also disables capture in development runtime tests. See [portal setup and email operations](../../apps/portal/README.md#email).

Newsletter data for the fresh portal stays in its Void-managed D1 (ADR-009), with generated migrations applied by CI. No newsletter OTP or `NEWSLETTER_DB` binding is provisioned. Mail links use the portal request origin; use a stable public hostname for live broadcasts and consider previously issued links before changing it. No legacy data or credentials are migrated.

### Personal deployment on reimagined

The reimagined deployment is **one Cloudflare Worker** (`members-portal-reimagined`) on Srijan's personal account, configured by the repo-root `wrangler.jsonc` and served at `https://180dc.vitcc.org` (Worker custom domain on the `vitcc.org` zone; `workers.dev` and preview URLs are disabled).

- The frontend build (`apps/frontend/dist`) is uploaded as Workers static assets. Asset requests, including SPA navigations (`not_found_handling = single-page-application` plus the `assets_navigation_prefers_asset_serving` flag), are served without invoking the Worker and are free/unbilled.
- Only `/api/*` runs the Worker (`run_worker_first = ["/api/*"]`). Non-navigation requests for missing files also reach the Worker and return its 404.
- Static-asset security headers (CSP, HSTS, frame/referrer policies) live in `apps/frontend/public/_headers`; `/api/*` responses get theirs from the Worker middleware. The API is same-origin, so no proxy is involved and the frontend calls relative `/api/...` URLs.
- Bindings: D1 `members-portal-reimagined-db` (`DB`) and `members-portal-reimagined-newsletter` (`NEWSLETTER_DB`); R2 `members-portal-reimagined-{club-files,blog-images,case-studies,gallery}`. No KV and no Queue. The email cron is disabled until mail secrets are set (uncomment `triggers` in `wrangler.jsonc`).
- CI: Workers Builds on `members-portal-reimagined` builds from the repo root on pushes to `main` with `pnpm run build` then `npx wrangler deploy` (Wrangler v4 is required for `run_worker_first` route arrays).
- Backblaze B2 (`180dc-vitc`) is the R2 failover and daily backup target: vars `B2_S3_ENDPOINT`, `B2_BUCKET` in `wrangler.jsonc`, secrets `B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_READ_KEY_ID`, `B2_READ_APPLICATION_KEY` on the Worker, and the `Backup to Backblaze B2` GitHub workflow. See [BACKUP_B2.md](BACKUP_B2.md).
- Secrets (`GOOGLE_CLIENT_SECRET`, mail credentials, AI keys) are set on the Worker, never in `wrangler.jsonc`. `GOOGLE_CLIENT_ID` is a plain var in `wrangler.jsonc`. The frontend needs no auth build variables.

The Pages proxy variable `API_ORIGIN` (legacy `API_PROXY_BASE`) only applies to the club Pages deployment.

Set the Worker runtime variable `ALLOWED_WEB_ORIGINS` to a comma-separated list of exact HTTPS web origins (no trailing slash or wildcard). Both CORS and CSRF checks accept these alongside existing origins; malformed lists fail closed for non-local browser requests. This adds no resource permissions and does not authenticate users. Verify a permitted POST and an unrelated origin's rejection before release.

The personal deployment never uses the club identifiers in `apps/admin-api/wrangler.toml`. Run `pnpm run build && pnpm exec wrangler deploy --dry-run` at the repo root before any personal release. The active roadmap is `docs/execution/unified-platform-plan.md`.

- **Local development:** `wrangler dev` for the worker, `pnpm dev` for the Vite frontend.
- **Production:** Cloudflare Pages for the frontend, Cloudflare Worker for `admin-api`.
- **Preview branches:** Cloudflare Pages and Wrangler support preview deployments.

## Repository setup

1. Install pnpm:

   ```bash
   npm install -g pnpm
   ```

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Ensure your Cloudflare account is authenticated with Wrangler:

   ```bash
   pnpm wrangler login
   ```

## Required secrets and variables

Create `apps/admin-api/.dev.vars` for local development:

```ini
ENVIRONMENT=development
# Optional: Google sign-in locally (register http://127.0.0.1:8787/api/auth/google/callback on the OAuth client)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
# Spacemail SMTP — the only email provider (authenticated mailbox; team@ is an alias on it)
SPACEMAIL_SMTP_USER=technical@180dcvitc.org
SPACEMAIL_SMTP_PASS=
# Leave empty until the separate newsletter site (ADR-004) is deployed
NEWSLETTER_SITE_URL=
```

The frontend only needs the API base in `apps/frontend/.env.local`:

```ini
VITE_API_BASE_URL=http://127.0.0.1:8787
```

In production, these are set via Wrangler secrets and Pages environment variables.

## Running locally

### Admin API

```bash
cd apps/admin-api
pnpm wrangler dev
```

- Default local URL: `http://127.0.0.1:8787`.
- The worker creates the D1 schema on first request if the local database is empty.

### Frontend

```bash
cd apps/frontend
pnpm dev
```

- Vite dev server runs the SPA.
- The local proxy in `vite.config.ts` may route `/api/*` to the local worker.

### Full stack

Run in two terminals:

```bash
cd apps/admin-api && pnpm wrangler dev
cd apps/frontend && pnpm dev
```

## Wrangler configuration

### `apps/admin-api/wrangler.toml`

```toml
name = "admin-api"
compatibility_date = "2024-09-01"
main = "src/index.ts"

[[d1_databases]]
binding = "DB"
database_name = "180dc-db"
database_id = "<D1_DATABASE_ID>"

[[d1_databases]]
binding = "NEWSLETTER_DB"
database_name = "newsletter-db"
database_id = "<NEWSLETTER_D1_DATABASE_ID>"

[[r2_buckets]]
binding = "CLUB_FILES"
bucket_name = "180dc-club-files"

[[r2_buckets]]
binding = "BLOG_IMAGES"
bucket_name = "180dc-blog-images"

[[r2_buckets]]
binding = "CASE_STUDIES"
bucket_name = "180dc-case-studies"

[[kv_namespaces]]
binding = "AUTH_SESSIONS"
id = "<KV_NAMESPACE_ID>"

[[queues.producers]]
binding = "QUEUE"
queue = "jobs-queue"

[triggers]
# Drains email_queue (up to 15 messages/minute, one message per recipient)
crons = ["* * * * *"]

[vars]
ENVIRONMENT = "production"
# Empty until the ADR-004 newsletter site is deployed; newsletters then link to {url}/newsletter/{id}
NEWSLETTER_SITE_URL = ""

# Note: ENVIRONMENT now ships via wrangler.toml [vars]. Local dev overrides it
# back to development: `pnpm dev` runs `wrangler dev --var ENVIRONMENT:development`.

# Secrets must be set via `wrangler secret put`
# GOOGLE_CLIENT_SECRET   (Google OAuth client secret; GOOGLE_CLIENT_ID is a var)
# SPACEMAIL_SMTP_USER     (technical@180dcvitc.org — also used as the From address)
# SPACEMAIL_SMTP_PASS     (mailbox password)
# SPACEMAIL_HOURLY_LIMIT  (optional: mailbox plan's messages/hour cap; default 500. Set 20 on trial plans)
# EMAIL_TEST_MODE         (dev/tests only: "capture" or "redirect"; ignored when ENVIRONMENT=production.
#                          Never set it on the deployed worker. See tests/README.md)
# EMAIL_TEST_RECIPIENT    (dev/tests only: inbox that receives redirected test emails)
```

> SMTP note: `sendEmail()` speaks SMTP directly from the Worker using `cloudflare:sockets` to `mail.spacemail.com:465` (implicit TLS). Workers cannot use port 25. Set the mailbox password with `npx wrangler secret put SPACEMAIL_SMTP_PASS` — never commit it.

> Queue note: bulk sends (newsletter/event/meet) are inserted into `email_queue` and delivered by the cron trigger. Finished (`done`/`failed`) campaigns are purged automatically after 30 days. Local dev does not run crons unless you use `wrangler dev --test-scheduled` and hit `/__scheduled?cron=*+*+*+*+*`. Inspect queue state via `GET /api/admin/email-queue` (board token).

The actual `database_id` and KV IDs are stored in `wrangler.toml` and should not be committed if they are sensitive. The repository currently has them in the file; this is a known configuration pattern but should be reviewed.

### `apps/frontend/wrangler.toml`

Cloudflare Pages build settings are configured in this file. The `functions/_middleware.ts` is the Pages middleware.

### `apps/job-processor/wrangler.toml`

Queue consumer binding for `jobs-queue`. Not used in production today.

### `apps/public-api/wrangler.toml`

No routes configured. Placeholder.

## Deployment commands

### Build

```bash
pnpm turbo run build
```

This builds only the frontend in the current configuration.

### Deploy admin-api

```bash
cd apps/admin-api
pnpm wrangler deploy
```

### Deploy frontend

```bash
cd apps/frontend
pnpm run build
pnpm wrangler pages deploy dist --project-name 180dc-admin-frontend
```

### Deploy all

The root `package.json` has helper scripts:

```bash
pnpm run deploy:backend     # deploys admin-api
pnpm run deploy:frontend    # builds and deploys frontend
pnpm run deploy:all         # deploys backend then frontend
```

## Migration procedure

For the reimagined device-session increment, deploy the backend before the frontend. Runtime bootstrap adds `member_sessions` and its index with `IF NOT EXISTS`, preserving registry/newsletter data. Verify token exchange and owner-scoped revocation in personal staging. No new secret or binding is required. Source-token validity remains a dependency of device sessions. For rollback, revert the frontend first or force re-login before reverting a backend without session support; retain the new table. Hashes and credentials must not be logged or included in support exports.

Because `admin-api` manages its own schema, deploying a new version is usually enough. If a migration needs careful control:

1. Deploy the new Worker version.
2. Trigger a single request so `ensureDbReady` and `runMigrations` run.
3. Verify schema with `wrangler d1 execute`.
4. Roll back by reverting the Worker and restoring a D1 backup if necessary.

Do **not** run `packages/db/schema.sql` directly against D1.

## Rollback

- Worker: `wrangler deploy` a previous version using a previous commit.
- Pages: use the Cloudflare Pages dashboard to roll back to a previous deployment.
- D1: restore from a backup if a destructive migration was deployed.

## Observability

- Worker logs are available in the Cloudflare Workers dashboard.
- Email failures are logged to `console.error`.
- Audit log entries are stored in the `audit_log` table.
- No external APM or error tracking is configured.

## Domain and routing

- `180dcvitc.org` is the public site.
- `admin-api.technical-vitc.workers.dev` is the Worker origin used by Pages middleware.
- Worker route pattern in `wrangler.toml`: `*180dcvitc.org/api/*`.

The Pages middleware rewrites `/api/*` requests to the Worker, so the frontend does not call `180dcvitc.org/api/*` directly.

### Google identity release gate

Set `GOOGLE_CLIENT_ID` in `wrangler.jsonc` and `GOOGLE_CLIENT_SECRET` as a Worker secret, and register `<origin>/api/auth/google/callback` for every origin that serves sign-in (production: `https://180dc.vitcc.org/api/auth/google/callback`). No other migration step is needed; `ensureTables` adds `users.google_sub`, `oauth_states` and `oauth_handoffs`. Members who used Clerk-based Google sign-in must sign in with their token and link Google again in Profile. Verify a real Google sign-in, link, unlink and a not-linked account after each release that touches auth.

### Persistent rate limits

Reimagined uses the existing primary D1 `rate_limits` table with atomic upserts for all existing rate-limited routes. No new table or binding is required. Keep this table across deploys/restores; restarting a worker must not clear its allowances. Each checked request now performs a D1 write, so include public read traffic in capacity monitoring. IP/endpoint rows persist after their windows expire and are reused; agree a retention/cleanup policy before public rollout. Cleanup must only delete rows older than the longest configured endpoint window (currently one hour), never active windows. Email quota counters and newsletter storage remain separate from this limiter.

### Shared-file namespace rollout

Club Files uses its existing R2 binding and object format; no schema migration, new binding or destructive object move is required. Inventory nonstandard categories/nested keys before importing live records. Only flat General/Projects/Events keys are now reachable through Club Files. Letter Studio documents stay in `letters/` and use their own authenticated APIs. Reserve a distinct private namespace for new contextual attachments; never write them into these shared categories.

### Today queue rollout

Deploy the additive `/api/work-queue` endpoint before the updated frontend. No new schema or bindings are required. The home refreshes the queue once per visible minute and after task completion; account for its read traffic and persistent limiter writes in D1 monitoring. Validate member/director/board/advisory journeys and mobile-width rendering on personal staging.

### Database selection before personal production

[ADR-005](../architecture/decisions/005-personal-database-evaluation.md) retains the existing two-D1 architecture for development and records PlanetScale alternatives. Before provisioning production, confirm the actual account plan, empty-database cold bootstrap/query limits, measured row read/write volumes, storage, recovery and spending ceiling. The new persistent limiter adds D1 writes to rate-checked reads; Dashboard/Today polling must be included. Hosted PlanetScale comparisons and a region/HA quote remain pending. Do not treat the documented starting Postgres price as a complete production bill or migrate the placeholder schema.

### Initial Android client

See `apps/mobile/README.md` and ADR-006. Set the public `EXPO_PUBLIC_API_URL` to the personal backend's exact HTTPS origin; no club default is supplied. Install root dependencies and use `pnpm --filter mobile start` with a device/emulator. `pnpm --filter mobile exec expo export --platform android` creates a JavaScript bundle, not an APK. Signing, app identifier/icon review, device validation and distribution remain open; no EAS or store publication occurred. Expo SecureStore backup exclusion must be verified in the generated native build.

Task scheduling rollout adds `project_tasks.due_date` and `priority` through runtime additive migrations. Existing records retain null due dates and normal priority. Exercise empty-schema bootstrap and an older schema with preserved task records in isolated local D1 before rollout. No standalone placeholder SQL should be used. Older clients ignore the extra response fields; the status PUT contract remains unchanged.

Task history adds an idempotent index to the existing audit table and begins recording creation and per-task bulk completion events transactionally. No legacy audit backfill or existing task rewrite is performed. Check scoped history, multi-page same-second ordering and bulk retry preservation in personal staging. Cross-database cutover must translate the SQLite append-order cursor to a preserved explicit sequence.
