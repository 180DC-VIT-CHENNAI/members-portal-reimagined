# Current State — 180DC VIT Chennai Platform

## Fresh Void portal rollout

The new `apps/portal` is a modular Void SPA/API deployed independently through origin-main CI to `180dc-portal`. The legacy Worker still owns `180dc.vitcc.org` until the explicit cutover. Start portal work with `apps/portal/README.md` and `docs/execution/portal-port-plan.md`; the implementation inventory below primarily describes the legacy system.

The portal port covers Google-only personnel identity/lifecycle, positions/terms and granular access; public content and administration; shared files/gallery; department workspaces; queued Cloudflare Email Sending; meets; projects, versioned tasks and comments/history; Today; team-instance staffing/progression; The Catalyst subscriptions/editor/archive/events; and private immutable Letter Studio documents with queued delivery history. Legacy OTP/registry credentials are not recreated.

This is a blank-data launch, not a data migration. Existing records/files and previously issued subscription credentials remain in the old deployment. Inbox-delivery confirmation, Google callback/domain readiness and explicit approval of live routing changes are launch gates, not implied by capture tests or a successful build.

This document describes the repository as it exists on the `main` branch. It is the descriptive source of truth for an agent starting work.

## Overall status

The project is a **brownfield** Cloudflare-native monorepo. The `admin-api` Worker and the Vite/React frontend are the production system. The `public-api` and `job-processor` Workers are placeholders. Several documents in `docs/architecture/` and `docs/product/REPORT.md` describe aspirational features that do not exist in code.

## What is implemented

### `apps/admin-api/index.ts`

This single file is the entire production backend. It is a Hono Worker with:

- Route handlers for public and authenticated endpoints.
- D1 schema creation and runtime migrations (`ensureTables` and `runMigrations`).
- R2 object storage for case-study images, source files, club files, and static completed-projects JSON.
- KV for auth sessions (bound as `AUTH_SESSIONS` but not actively used in `main`; the token registry lives in D1).
- Queue producer binding (`QUEUE`) configured but unused.
- Unified email delivery: `sendEmail()` sends through Spacemail SMTP (the only provider, via `cloudflare:sockets`; every message has one recipient). Resend was removed.
- Hourly/daily email accounting in D1 (`email_hour_count`, `daily_email_count`); the queue uses at most 90% of the hourly limit.
- Bulk email queue (`email_queue`) drained by the `* * * * *` cron with adaptive pacing (up to 15 messages/minute, ≤500/hour); every campaign is one message per recipient, 1.5 s apart (newsletter and event mail personalized per subscriber): newsletter, event, and meet notifications enqueue and return immediately; failed campaigns retry up to 5 times; completion writes `recipient_count` back to the newsletter row. Per-recipient outcomes are tracked in `email_deliveries` (board can retry failures), and subscribers unsubscribe through tokenized `/unsubscribe/<token>` links with RFC 8058 one-click headers.
- Newsletter data lives in a separate D1 database (`NEWSLETTER_DB`, `newsletter-db`); the old tables in `180dc-db` are frozen backups.
- Rate limiting in D1.
- HTML sanitization (`sanitizeBlogHtml`).
- Password hashing (PBKDF2) but no password login flow currently used.

### `apps/frontend`

A Vite + React + TypeScript SPA with React Router.

- Public landing page (`/`).
- `/members` members portal (token or Google sign-in).
- `/subscriber` public newsletter subscription page (email double opt-in).
- `/subscriber/newsletter` OTP-based newsletter editor.
- `/unsubscribe` public unsubscribe page.
- `/recruitments` and `/request-account` public pages.
- Cloudflare Pages `_middleware.ts` proxies `/api/*` to `admin-api.technical-vitc.workers.dev` and adds security headers.

### Newsletter API (prep for the separate newsletter site, ADR-004)

- `GET /api/newsletter/:id` public endpoint exists — rate-limited, returns newsletter
  detail with `content` sanitized via `sanitizeBlogHtml` (never raw stored HTML).
  The planned separate newsletter site (own repo, `newsletter.180dcvitc.org`) fetches
  `GET /api/newsletter` (list), `GET /api/newsletter/:id` (detail), subscribe, and
  unsubscribe.
- CORS/CSRF allowlist (`ALLOWED_ORIGINS` in `apps/admin-api/index.ts`) includes
  `https://newsletter.180dcvitc.org` and `https://180dc-newsletters.technical-vitc.workers.dev`.
- The newsletter site (repo `180DC-VIT-CHENNAI/Newsletters`) is live as a static
  Cloudflare Worker at `https://180dc-newsletters.technical-vitc.workers.dev`: archive at
  `/newsletters`, Ken-style article pages at `/newsletter/{slug|id}`, server-side-free
  (Vite SPA) with client-side fetches to the public API. `NEWSLETTER_SITE_URL` is set to
  it, so bulk email CTAs link to `{site}/newsletter/{slug}`.
- `/subscriber/newsletter` is the single send hub (newsletter issues + event mail). Sent
  issues get a "View on the web" link there; the public list returns **sent issues only**,
  so drafts stay unpublished until they are mailed. The `/newsletter` pages on the main
  site were removed — the separate site owns the archive and articles.

### D1 data

Live data is in the `180dc-db` D1 database. Schema creation and migrations are run by the Worker on first request via `ensureDbReady`.

Newsletter data (`newsletters`, `newsletter_subscribers`, `newsletter_authorized_emails`, `newsletter_otp_codes`, `newsletter_sessions`) lives in the separate `newsletter-db` database (`NEWSLETTER_DB` binding), initialized by `ensureNewsletterReady`. The copies in `180dc-db` are frozen legacy backups.

### Cloudflare Pages

The frontend is deployed as a Cloudflare Pages project named `180dc-admin-frontend` (per root `package.json` and `_middleware.ts`).

### Worker routes

- `admin-api` Worker route pattern: `*180dcvitc.org/api/*`.
- `public-api` Worker route pattern: no routes configured in `wrangler.toml`.
- `job-processor` Worker: queue consumer for `jobs-queue`, no message producers.

## What is a placeholder or not implemented

| Component | File | Status |
|-----------|------|--------|
| `public-api` Worker | `apps/public-api/index.ts` | Returns "Hello from public-api!" only. No routes or logic. |
| `job-processor` Worker | `apps/job-processor/index.ts` | Returns `{ success: true }` only. Queue consumer configured but no messages are produced. |
| `packages/db` | `packages/db/schema.sql` | Contains destructive `DROP TABLE` statements and a partial schema. Not used at runtime. |
| `docs/architecture/backend-architecture-cloudflare.txt` | `docs/architecture/` | Historical/aspirational design. Mentions Cloudflare Access, Next.js, Zod, KV caching, and presigned R2 uploads that do not exist in code. |
| Recruitment system | Mentioned in `docs/product/REPORT.md` | Removed from code. `runMigrations` drops recruitment tables. |
| Real-time chat | Mentioned in `docs/product/REPORT.md` | Not implemented in `main`. |
| AI chatbot (ConsultAI) | Mentioned in `docs/product/REPORT.md` | Not implemented in `main`. |
| Amazon SES | `docs/operations/SES_SETUP.md`, `architecture/NEWSLETTER_BULK_SEND_DECISION.md` | Not implemented. Spacemail SMTP is the only provider (`docs/operations/SPACEMAIL_SETUP.md`); SES stays a possible future transport behind `sendEmail()`. |

## Important discrepancies between documentation and code

| Document/code | Claims | Reality | Classification |
|---------------|--------|---------|----------------|
| `docs/architecture/backend-architecture-cloudflare.txt` | Cloudflare Access enforces Google OAuth before admin requests. | Auth is custom token-based; Google sign-in is the Worker's own OAuth flow, not Cloudflare Access. | ACCIDENTAL/HISTORICAL |
| `docs/architecture/backend-architecture-cloudflare.txt` | Public API is a separate Hono Worker at `api.180dc-vit.in`. | `public-api` is a placeholder. All API calls are served by `admin-api`. | ACCIDENTAL/HISTORICAL |
| `docs/architecture/backend-architecture-cloudflare.txt` | KV caching for public API. | KV is bound but not used for caching. | ACCIDENTAL/HISTORICAL |
| `docs/architecture/backend-architecture-cloudflare.txt` | Zod validation. | No Zod schemas in code. | ACCIDENTAL/HISTORICAL |
| `docs/product/REPORT.md` | Recruitment, chat, AI chatbot features. | Not implemented in `main`. | UNKNOWN/PLANNED |
| `packages/db/schema.sql` | "Placeholder for D1 schema and migrations." | File is dangerous and out of sync with runtime schema. | BUG (for documentation only) |
| `docs/operations/NEWSLETTER_EDITOR.md` | Describes newsletter editor accurately. | Current and accurate. | REQUIRED |
| `TEAM_INSTANCES_PLAN.md` | Describes team instances feature. | Implemented in `admin-api/index.ts` and `TeamInstancesSection.tsx`. | REQUIRED |

## Deployment topology

```
Public DNS 180dcvitc.org
  → Cloudflare Pages (180dc-admin-frontend)
      → Vite React SPA
      → _middleware.ts proxies /api/* to admin-api.technical-vitc.workers.dev

admin-api Worker
  → Deployed from apps/admin-api/index.ts
  → D1 database 180dc-db (members, projects, meets, email_queue, counters)
  → D1 database newsletter-db via NEWSLETTER_DB (newsletter tables)
  → R2 buckets CLUB_FILES, BLOG_IMAGES, CASE_STUDIES
  → KV namespace AUTH_SESSIONS
  → Queue binding QUEUE (unused)
  → Cron trigger * * * * * drains email_queue
  → Spacemail SMTP for all email

job-processor Worker
  → Queue consumer for jobs-queue (no producers)

public-api Worker
  → Placeholder
```

## Environment and secrets

The following bindings and secrets are used by `admin-api`:

| Name | Type | Purpose |
|------|------|---------|
| `DB` | D1 database | Main application database (`180dc-db`). |
| `NEWSLETTER_DB` | D1 database | Newsletter database (`newsletter-db`): newsletters, subscribers, editor auth. |
| `CLUB_FILES` | R2 bucket | File manager uploads. |
| `BLOG_IMAGES` | R2 bucket | Static completed projects JSON and case-study source files. |
| `CASE_STUDIES` | R2 bucket | Case study images and newsletter source files. |
| `AUTH_SESSIONS` | KV namespace | Bound but not actively used in `main`. |
| `QUEUE` | Queue producer | Bound but not used in `main`; bulk email uses `email_queue` + cron. |
| `SPACEMAIL_SMTP_USER` / `SPACEMAIL_SMTP_PASS` | Secret | The only email sender (mailbox `technical@180dcvitc.org`). |
| `GOOGLE_CLIENT_SECRET` | Secret | Google OAuth client secret (`GOOGLE_CLIENT_ID` is a var). |
| `ENVIRONMENT` | Var | Set to `production` on the deployed worker. |
| `NEWSLETTER_SITE_URL` | Var | Base URL of the newsletter site (ADR-004): `https://180dc-newsletters.technical-vitc.workers.dev`. Bulk email CTAs link to `{site}/newsletter/{slug}`. |
| `SPACEMAIL_SMTP_USER` | Secret | Authenticated SMTP mailbox (`technical@180dcvitc.org`), also the From address. Set in production. |
| `SPACEMAIL_SMTP_PASS` | Secret | Mailbox password for SMTP AUTH. Set in production. |
| `SPACEMAIL_HOURLY_LIMIT` | Secret | Optional pacing cap for the mailbox messages/hour. Removed after upgrading to a paid plan; absent = default `500`. |

The following are used by the frontend:

| Name | Type | Purpose |
|------|------|---------|
| `VITE_API_BASE_URL` | Env var | Optional override for local API base. Defaults to `http://127.0.0.1:8787` in dev and same-origin in production. |

## Known current behavior that must be preserved

- All API routes are served by `admin-api`. The frontend relies on this.
- Token auth uses the `admin_tokens` table. Tokens are created by board members and emailed.
- Rate limits and email caps are enforced (`email_hour_count`).
- Meet link visibility is hidden after the scheduled time.
- `runMigrations` is idempotent and drops legacy recruitment tables.
- `ensureTables` creates tables only if they do not exist.

## Known gaps and accepted debt

- No automated tests.
- No formal migration files; schema evolution is in `admin-api/index.ts`.
- `public-api` and `job-processor` are not used.
- `packages/db` is a placeholder and misleading.
- `docs/architecture/backend-architecture-cloudflare.txt` is historical and may confuse new agents.

## Next steps — newsletter system (Spacemail + separate newsletter site)

Ordered by dependency. `[done]` items are live in production (verified 2026-10-05/06).

1. **Cloudflare DNS:** `[done]` root `180dcvitc.org` has MX `mx1/mx2.spacemail.com`
   (priority 0), SPF `v=spf1 include:spf.spacemail.com ~all`, and DKIM at
   `spacemail._domainkey` (verified live 2026-10-06). DMARC stays `p=none`. Resend has since
   been removed, so the `resend._domainkey` TXT records can be deleted.
2. **Spacemail Manager:** `[done]` domain verified (`fbf0abfa...` TXT present); DKIM TXT
   added. Mailbox `technical@180dcvitc.org` exists and SMTP AUTH works; all From addresses
   use this mailbox, so Spacemail's sender-ownership check passes without an alias. The old
   `mail.180dcvitc.org` MX/SPF records are gone.
3. **Separate newsletter repo:** `[done]` the newsletter site lives in repo
   `180DC-VIT-CHENNAI/Newsletters` (static Vite SPA Worker) at
   `https://180dc-newsletters.technical-vitc.workers.dev`, fetching
   `GET /api/newsletter` (archive) and `GET /api/newsletter/{slug|id}` (article). CTA to a
   `newsletter.180dcvitc.org` custom domain is optional.
4. **DNS:** optional. Add CNAME `newsletter` → the Worker host if a custom domain is wanted.
5. **Deploy admin-api:** `[done]` public `GET /api/newsletter/:id`, CORS origins, SMTP email
   layer, bulk `email_queue` + cron, slugs, and the `NEWSLETTER_DB` split are deployed.
6. **Secrets:** `[done]` `SPACEMAIL_SMTP_USER=technical@180dcvitc.org` /
   `SPACEMAIL_SMTP_PASS` set via `wrangler secret put`; SMTP AUTH and sender acceptance
   verified live, plus a production queue drain test.
7. **SMTP migration:** `[done]` `sendEmail()` choke-point (SMTP via `cloudflare:sockets`,
   BCC batches of 50, MIME + attachments, 500/hour accounting) replaced all
   16 Resend call sites. The Resend fallback was later removed entirely. Bulk sends now enqueue to `email_queue` and drain via cron.
8. **Email templates:** `[done]` bulk CTAs link to `NEWSLETTER_SITE_URL/newsletter/{slug}`
   (now live); fallback remains `180dcvitc.org/#newsletter`. Welcome/re-subscribe templates
   redesigned.
9. **Verify:** `[done]` test sends `From: technical@180dcvitc.org` went through SMTP. Keep DMARC `p=none` for a week after switch, then consider
   `p=quarantine`.
10. **Newsletter D1 split:** `[done]` newsletter tables migrated to `newsletter-db`
    (`NEWSLETTER_DB`); old copies in `180dc-db` remain as frozen backups.
11. **Docs cleanup:** `[done]` for `NEWSLETTER_EDITOR.md`, `api-contract.md`,
    `business-logic.md`, `invariants.md`, `deployment.md`, data model, architecture, and
    `AGENTS.md`.
