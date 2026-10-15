# System Architecture — 180DC VIT Chennai Platform

## High-level architecture

The platform is a Cloudflare-native monorepo with a single-page React frontend and a single Hono Worker backend.

```text
Public visitors / members
        |
        v
Cloudflare Pages  (apps/frontend)
  ├─ Vite + React SPA
  ├─ Clerk for Google OAuth
  └─ _middleware.ts proxies /api/* to admin-api Worker
        |
        v
Cloudflare Worker (apps/admin-api)
  ├─ Hono app
  ├─ D1 database (180dc-db)
  ├─ R2 object storage
  ├─ KV namespace (bound, unused)
  ├─ Queue binding (bound, unused)
  ├─ Spacemail SMTP (primary email via cloudflare:sockets)
  └─ Resend email API (fallback)
        |
        v
External: Spacemail SMTP, Resend, Clerk, Google Fonts/CDN
```

## Components

### Frontend (`apps/frontend`)

- **Build tool:** Vite.
- **Framework:** React 19 + TypeScript.
- **Routing:** `react-router-dom` (BrowserRouter).
- **Styling:** CSS variables, GSAP for scroll and reveal animations, `lenis` for smooth scrolling.
- **Auth:** `@clerk/react` for Google OAuth on `/members`, `/subscriber`, and `/subscriber/newsletter`.
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
- **Email:** Unified `sendEmail()` choke-point — Spacemail SMTP (`mail.spacemail.com:465`, `SPACEMAIL_SMTP_USER`/`SPACEMAIL_SMTP_PASS`) primary, Resend (`RESEND_API_KEY`) automatic fallback. BCC batches of up to 50; quotas tracked in `email_hour_count` (500/hour) and `resend_daily_count` (100/day).
- **Clerk:** `@clerk/backend` `verifyToken` used only for Google login linking.
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
2. `ClerkGate.tsx` wraps `MembersLayout.tsx`.
3. User enters token and clicks "Continue with Token".
4. Frontend `MembersLogin.tsx` posts `POST /api/dev-login`.
5. `admin-api` validates token against `admin_tokens` table.
6. On success, frontend stores `authToken`, `authEmail`, `authPowerLevel`, `authDepartmentId`, `authRoleId`, and `authExpiresAt` in `sessionStorage`/`localStorage`.
7. Subsequent requests include `Authorization: Bearer <token>`.

### Google login with Clerk

1. User clicks "Sign in with Google".
2. Clerk redirects to Google OAuth.
3. On return, `MembersLayout.tsx` obtains a Clerk JWT from `getToken()`.
4. Frontend posts `POST /api/auth/clerk-login` with `clerkToken`.
5. `admin-api` verifies the Clerk JWT using `CLERK_SECRET_KEY`.
6. `admin-api` fetches the Clerk user via the Clerk Backend API and only trusts Clerk-verified emails (never the request body).
7. If `clerk_user_id` is linked to a user (and matches a verified email) and `oauth_enabled = 1`, an `admin_tokens` row is created or reused; otherwise the user is matched by a verified email and linked.
8. Frontend stores the returned token and profile.

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
- The `* * * * *` cron drains the queue: one message per subscriber (1.5 s apart, per-recipient unsubscribe token and `List-Unsubscribe` headers, outcomes in `email_deliveries`), Spacemail SMTP primary with Resend fallback.
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
| Email quota | D1 `email_hour_count` (500 SMTP messages/hour) and `resend_daily_count` (100 fallback recipients/day). |

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
- Bulk email is sent over SMTP from the Worker using `cloudflare:sockets` (`mail.spacemail.com:465`). Long sends block the Worker request; the hourly quota and Resend fallback bound the work.
