# System Architecture — 180DC VIT Chennai Platform

## High-level architecture

On `reimagined`, Pages supports an optional runtime `API_ORIGIN` for personal-account Worker routing and matching CSP connection origins. Absent configuration retains the existing Worker origin. Invalid values fail closed. API redirects are not followed by the proxy. The backend accepts explicit additional HTTPS browser origins via `ALLOWED_WEB_ORIGINS` for both CORS and CSRF. Infrastructure bindings still require personal deployment configuration.

The reimagined personal deployment does not use Pages: one Worker (`members-portal-reimagined`, repo-root `wrangler.jsonc`, `https://180dc.vitcc.org`) serves `apps/frontend/dist` as static assets (free, never invokes the Worker, headers from `_headers`) and runs `apps/admin-api` only for `/api/*`. It has its own D1 databases and R2 buckets, and no KV or Queue binding. The diagram below describes the club deployment.

The platform is a Cloudflare-native monorepo with a single-page React frontend and a single Hono Worker backend.

```text
Public visitors / members
        |
        v
Cloudflare Pages  (apps/frontend)
  ├─ Vite + React SPA
  ├─ Google sign-in by redirect to the Worker's OAuth routes
  └─ _middleware.ts proxies /api/* to admin-api Worker
        |
        v
Cloudflare Worker (apps/admin-api)
  ├─ Hono app
  ├─ D1 database (180dc-db)
  ├─ R2 object storage
  ├─ KV namespace (bound, unused)
  ├─ Queue binding (bound, unused)
  └─ Spacemail SMTP (all email, via cloudflare:sockets)
        |
        v
External: Spacemail SMTP, Google OAuth, Google Fonts/CDN
```

## Components

### Frontend (`apps/frontend`)

- **Build tool:** Vite.
- **Framework:** React 19 + TypeScript.
- **Routing:** `react-router-dom` (BrowserRouter).
- **Styling:** CSS variables, GSAP for scroll and reveal animations, `lenis` for smooth scrolling.
- **Auth:** no auth SDK. Token sign-in plus Google sign-in by full-page redirect to `/api/auth/google/*`; `/subscriber` uses email double opt-in.
- **Member token storage:** `sessionStorage` for `authToken`, `authEmail`, `authPowerLevel`, `authDepartmentId`, `authRoleId`. `localStorage` for `authExpiresAt` (7-day inactivity expiry) and `membersSidebarCollapsed`.
- **Pages middleware:** `apps/frontend/functions/_middleware.ts` adds security headers, serves the SPA fallback for 404s, sets JS MIME types, and proxies `/api/*` to `admin-api.technical-vitc.workers.dev`.

### Admin API (`apps/admin-api`)

- **Runtime:** Cloudflare Worker using `hono`.
- **Entry point:** `index.ts` (single 5000+ line file).
- **Database:** D1 (`DB` binding) for members/projects/meets/email infra; separate D1 `NEWSLETTER_DB` (`newsletter-db`) for newsletter data.
- **Cron:** `* * * * *` trigger drains the `email_queue` with adaptive pacing (up to 15 messages/minute, under the 500/hour Spacemail cap); every campaign is one message per recipient (newsletter/event mail personalized per subscriber).
- **Storage:** R2 buckets `CLUB_FILES`, `BLOG_IMAGES`, `CASE_STUDIES`.
- **Cache/session:** KV `AUTH_SESSIONS` (bound but not used in `main`).
- **Queue:** `QUEUE` producer binding (bound but not used in `main`).
- **Email:** Unified `sendEmail()` choke-point — Spacemail SMTP (`mail.spacemail.com:465`, `SPACEMAIL_SMTP_USER`/`SPACEMAIL_SMTP_PASS`) is the only provider (no fallback). One recipient per message; quota tracked in `email_hour_count` (500/hour, queue limited to 90%).
- **Google OAuth:** `apps/admin-api/google-oauth.ts` implements the authorization code flow with PKCE and ID-token checks using `fetch` only.
- **Schema and migrations:** `ensureTables` and `runMigrations` in `index.ts`.

### Public API (`apps/public-api`)

- **Status:** Placeholder.
- Returns "Hello from public-api!" for all requests.

### Job Processor (`apps/job-processor`)

- **Status:** Placeholder.
- Queue consumer for `jobs-queue` but no producers.

### D1 database (`180dc-db`)

- All application state except uploaded file bytes and static JSON cache.
- Tables for users, roles, departments, projects, tasks, meets, files metadata, newsletter, consulting requests, audit log, rate limits, and more.

### R2 buckets

| Bucket | Binding | Content |
|--------|---------|---------|
| `180dc-club-files` | `CLUB_FILES` | Club file uploads with custom metadata. |
| `180dc-blog-images` | `BLOG_IMAGES` | Static `completedProjects.json`. |
| `180dc-case-studies` | `CASE_STUDIES` | Case-study images and source files, newsletter source files. |

## Request flow

### Public landing page

1. Browser requests `180dcvitc.org/`.
2. Cloudflare Pages serves `index.html` and the Vite-built SPA.
3. `App.tsx` mounts and fetches public data:
   - `GET /api/content/case-studies`
   - `GET /api/content/team-members`
   - `GET /api/projects/completed`
4. `_middleware.ts` proxies each `/api/*` call to the `admin-api` Worker.
5. `admin-api` `isPublicRoute` allows the request.
6. `admin-api` returns JSON.

### Member login with token

1. User opens `/members`.
2. `MembersLayout.tsx` shows `MembersLogin.tsx` when no session is stored.
3. User enters token and clicks "Continue with Token".
4. Frontend `MembersLogin.tsx` posts `POST /api/dev-login`.
5. `admin-api` validates token against `admin_tokens` table.
6. On success, frontend stores `authToken`, `authEmail`, `authPowerLevel`, `authDepartmentId`, `authRoleId`, and `authExpiresAt` in `sessionStorage`/`localStorage`.
7. Subsequent requests include `Authorization: Bearer <token>`.

### Google sign-in (Worker OAuth)

1. User clicks "Sign in with Google" on `/members`; the browser navigates to `GET /api/auth/google/start`.
2. The Worker stores a single-use state (hashed, 10-minute TTL, with a PKCE verifier) in `oauth_states`, sets the HttpOnly `g_oauth_state` cookie, and redirects to Google.
3. Google redirects to `GET /api/auth/google/callback`. The Worker requires the cookie to match the state, deletes the state, exchanges the code with `GOOGLE_CLIENT_SECRET` and the PKCE verifier, and checks the ID token's issuer, audience, expiry and subject.
4. The Worker finds exactly one member with that `users.google_sub` and `oauth_enabled = 1`, with an active (unrevoked, unexpired) registry token. Email never selects an account.
5. It issues the same member session as token sign-in, stores it under a single-use 60-second handoff code in `oauth_handoffs`, and redirects to `/members?google_code=...`.
6. The frontend posts the code to `POST /api/auth/google/exchange` and stores the returned session. Failures redirect to `/members?google_error=<code>`.

### Authenticated API call

1. Frontend includes `Authorization: Bearer <token>`.
2. Cloudflare Pages `_middleware.ts` proxies to `admin-api`.
3. `admin-api` auth middleware extracts the token.
4. It queries `admin_tokens` and checks `revoked_at` and `expires_at`.
5. It loads the user from `users` and joins `roles` to get `power_level`.
6. It checks `maintenance_mode`; if enabled and `power_level < 100`, returns 503.
7. It sets `c.set("user", user)`.
8. Route handler checks `power_level` thresholds and runs business logic.
9. Handler may write to `audit_log` and `rate_limits`.

## Data flow

### Completed projects cache

- When a project is marked complete or reopened, `regenerateCompletedProjectsJson` writes an HTML-escaped JSON blob to `BLOG_IMAGES` under `static/completedProjects.json`.
- `GET /api/projects/completed` reads this R2 object; falls back to D1 if missing.

### Meet emails

- When a meet is created with notifications, `queueOrSendMeetEmails` fetches recipients and sends through `sendEmail()` up to the hourly Spacemail cap.
- Emails above the quota are inserted into `pending_emails`.
- `POST /api/meets/process-queue` sends pending meet emails manually.

### Newsletter sends

- Admin or newsletter editor calls `POST /api/newsletter/send` or `POST /api/newsletter-editor/send`.
- The handler renders the shared email once and inserts an `email_queue` campaign (recipients JSON, R2 attachment references, `meta.newsletter_id`); it returns immediately with `queued`/`total`.
- The `* * * * *` cron drains the queue: one message per subscriber (1.5 s apart, per-recipient unsubscribe token and `List-Unsubscribe` headers, outcomes in `email_deliveries`), sent through Spacemail SMTP.
- On completion the cron writes `sent_at`/`recipient_count` back to the newsletter row in `NEWSLETTER_DB` (via the campaign meta).
- Event mail and meet notifications use the same queue (`kind: event` / `kind: meet`).

### File uploads

- Case-study images: `POST /api/case-studies/upload-image` writes to `CASE_STUDIES` under `images/<uuid>.<ext>`.
- Club files: `POST /api/club-files/upload` writes to `CLUB_FILES` under `<category>/<uuid>.<ext>` with custom metadata.
- Newsletter source files: `POST /api/newsletter-editor/upload-source` and `POST /api/newsletter/upload-source` write to `CASE_STUDIES` under `source/<uuid>.<ext>`.

## Trust boundaries

| Boundary | Enforcement |
|----------|-------------|
| Public vs authenticated | `isPublicRoute` in `admin-api/index.ts`. |
| Member vs director vs board | `power_level` thresholds (`>= 10`, `>= 50`, `>= 100`) in route handlers. |
| Department isolation | Directors can only see/manage their own department unless `power_level >= 100`. |
| Newsletter editor access | Authorized emails or members with `power_level != 30`. |
| Rate limiting | D1 `rate_limits` table per IP and endpoint. |
| Email quota | D1 `email_hour_count` (500 SMTP messages/hour; the queue uses at most 90%). |

## Concurrency and consistency

- D1 writes go to a single primary. Reads are globally replicated.
- `ensureDbReady` caches a promise per Worker isolate to avoid repeated schema checks.
- `runMigrations` runs idempotent `ALTER TABLE` and `DROP TABLE` statements wrapped in `try/catch`.
- There are no transactions across multiple D1 statements in the current code.

## Error handling

- `app.onError` is not explicitly configured; each handler catches errors and returns `errorResponse`.
- Consistent response shape: `{ success: true, ... }` or `{ error: "..." }` with an HTTP status.

## Technology-specific limitations

- Cloudflare Workers free plan: 10ms CPU per request. The current heavy `index.ts` file and multiple D1 round trips may approach this under load.
- D1 does not support stored procedures or triggers. Schema migrations must be handled in application code.
- Workers do not have a filesystem. All uploads use R2.
- Bulk email is sent over SMTP from the Worker using `cloudflare:sockets` (`mail.spacemail.com:465`). Long sends block the Worker request; the hourly quota bounds the work.

Database development choice and PlanetScale migration gates: [ADR-005](decisions/005-personal-database-evaluation.md). Two D1 databases remain in use; hosted capacity comparison and the personal production plan are not yet verified.

The initial Android member client lives in `apps/mobile` and consumes the same custom-session/work-queue/task APIs over an explicitly configured personal HTTPS origin. Native runtime/storage is on Android; API/data infrastructure remains on Cloudflare. See ADR-006 and the mobile capability matrix for implementation and acceptance boundaries.

## Void portal (`apps/portal`)

The rewrite (ADR-007) is a separate Void app on the `180dc-portal` Worker, deployed by `.github/workflows/portal-ci.yml` when PRs merge to `main`. Static assets are served by Workers Assets; only `/api/*` and `/__void/*` run the Worker.

- Bindings: D1 `DB` (`180dc-portal-db`); R2 `CLUB_FILES`, `CASE_STUDIES` and `GALLERY_CDN`; `SEND_EMAIL` for Cloudflare Email Sending, restricted to `noreply@180dc.vitcc.org` (ADR-008). No KV and no Queue.
- Cron: `* * * * *` (`crons/email.ts`) drains the D1 email queue: at most 15 recipients per minute, under a self-imposed 500/hour cap.
- Auth: Better Auth with Google only, invite-gated; permissions are resolved per request in route guards.
