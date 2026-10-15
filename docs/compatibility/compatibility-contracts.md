# Compatibility Contracts — 180DC VIT Chennai Platform

These contracts are the surfaces that external systems, the frontend, and club members depend on. Do not break them without an explicit migration plan.

## COMP-API-01 Public API routes must remain functional

The following routes are called by the public website without authentication. They must continue to return the same JSON shape and status codes.

- `GET /api/content/case-studies`
- `GET /api/content/team-members`
- `GET /api/content/partners`
- `GET /api/newsletter`
- `POST /api/newsletter/subscribe`
- `GET /api/newsletter/unsubscribe`
- `GET /api/newsletter/subscribers/count`
- `GET /api/departments`
- `GET /api/projects/completed`
- `GET /api/case-studies/images/*`
- `GET /api/admin/maintenance`
- `POST /api/signup-requests`
- `POST /api/consulting-request`
- `POST /api/dev-login`
- `POST /api/auth/clerk-login`
- `POST /api/auth/forgot-token`
- `POST /api/newsletter-editor/otp/send`
- `POST /api/newsletter-editor/otp/verify`

## COMP-API-02 Authenticated API response shape

All authenticated endpoints must return a top-level `success: boolean` and use consistent error fields:

```json
{ "success": true, "data": [...] }
{ "success": true, "message": "..." }
{ "error": "...", "retryAfter": 120 }
```

Do not change the status code conventions:

- `200` — success.
- `400` — client error / validation.
- `401` — missing or invalid token.
- `403` — forbidden (insufficient power).
- `404` — not found.
- `429` — rate limit or quota.
- `500` — server error.
- `503` — maintenance mode enabled.

## COMP-AUTH-01 Token contract

- Members log in with a UUID token stripped of dashes.
- Tokens are stored in `admin_tokens.token` (PRIMARY KEY) and looked up by `email`.
- Tokens are sent via `Authorization: Bearer <token>`.
- Tokens have `created_at`, optional `revoked_at`, and optional `expires_at`.
- Token validity requires `revoked_at IS NULL` and `expires_at` in the future or null.
- `POST /api/auth/rotate-token` creates a new token and deletes the old one.
- The `/api/forgot-token` behavior must return `200` with `success: true` even if the email does not exist, to prevent enumeration.

## COMP-AUTH-02 Role and permission contract

- `roles.power_level` is the source of truth for access control.
- Board threshold is `>= 100`.
- Director threshold is `>= 50`.
- Member threshold is `>= 10`.
- Advisory role `power_level = 30`.
- `users.department_id` is used to scope director access.
- The `requireBoard`, `requireMember`, `canAccessDept`, `canManageInstanceTeams`, and `canManageProjectTasks` helpers must not be changed without auditing all dependent endpoints.

## COMP-UI-01 Frontend storage keys

The frontend stores the following keys. Do not change key names or value shapes without a migration plan and frontend update.

- `sessionStorage.authToken`
- `sessionStorage.authEmail`
- `sessionStorage.authPowerLevel`
- `sessionStorage.authDepartmentId`
- `sessionStorage.authRoleId`
- `localStorage.authExpiresAt`
- `localStorage.membersSidebarCollapsed`

## COMP-UI-02 Frontend page structure

The public and members portal routes are defined by `react-router-dom`. The following path semantics must be preserved:

- `/` — public landing.
- `/members` — members portal (Clerk gate).
- `/members/*` — members portal sub-pages.
- `/subscriber` — newsletter subscriber page with Clerk.
- `/subscriber/newsletter` — newsletter editor (OTP).
- `/unsubscribe` — unsubscribe.
- `/request-account` — account request.
- `/recruitments` — recruitment placeholder.

## COMP-DEPLOY-01 Cloudflare Pages middleware

`apps/frontend/functions/_middleware.ts` proxies `/api/*` to `API_ORIGIN` when configured, defaulting to `admin-api.technical-vitc.workers.dev`. The Worker can add explicit browser origins with `ALLOWED_WEB_ORIGINS`; existing defaults remain accepted. Verify routing and origin checks on a preview deployment before cutover.

## COMP-DEPLOY-02 Wrangler bindings

The following binding names are referenced in code. Changing them requires updates to `wrangler.toml`, `worker-configuration.d.ts`, and the local `.dev.vars` files.

- `DB`
- `CLUB_FILES`
- `BLOG_IMAGES`
- `CASE_STUDIES`
- `AUTH_SESSIONS`
- `QUEUE`
- `RESEND_API_KEY`
- `CLERK_SECRET_KEY`
- `ENVIRONMENT`

## COMP-DATA-01 Table and column names

The D1 table and column names in `docs/contracts/data-model.md` are a compatibility surface. Any rename requires a migration that preserves old names as views or a coordinated frontend/backend rollout.

Special attention:

- `users.email` must remain unique.
- `admin_tokens.token` is the primary key and `email` is unique.
- `project_departments` and `instance_departments` composite keys.
- `daily_email_count.date` is the primary key.

## COMP-EMAIL-01 Sender addresses and templates

Emails are sent from these addresses and use the 180DC VIT Chennai branded template. Changing the from address, provider, or template shape may affect deliverability. Spacemail SMTP is primary; Resend is the fallback.

- `180DC Admin <technical@180dcvitc.org>`
- `180DC Consulting <technical@180dcvitc.org>`
- `180DC Newsletter <technical@180dcvitc.org>`
- `180DC Events <technical@180dcvitc.org>`
- `180DC Letter Studio <technical@180dcvitc.org>`

## COMP-EMAIL-02 Send quotas and batching

- SMTP sends are capped at 500 messages/hour, and each message carries at most 50 BCC recipients (`email_hour_count`).
- The Resend fallback is capped at 100 recipients/day (`resend_daily_count`).
- Bulk email bodies are shared across a BCC batch, so per-recipient unsubscribe links are not embedded; the footer links to the public `/unsubscribe` page.
- Changing these caps or the batching model requires coordination with the email provider and a docs update.

## COMP-R2-01 Bucket keys

The following key patterns are used in R2. Do not change them without a data migration.

- `BLOG_IMAGES`: `static/completedProjects.json`
- `CLUB_FILES`: `<category>/<uuid>.<ext>`
- `CASE_STUDIES`: `images/<uuid>.<ext>`, `source/<uuid>.<ext>`

## COMP-CLERK-01 Frontend public key

The frontend relies on `VITE_CLERK_PUBLISHABLE_KEY`. The backend relies on `CLERK_SECRET_KEY`. Clerk JWTs issued by `@clerk/react` must continue to be verifiable by `@clerk/backend` in `admin-api`.

## COMP-CLERK-02 Linked account contract

A Clerk login is valid only when:

1. The Clerk JWT is valid.
2. Exactly one `users.clerk_user_id` matches the verified session subject; client email is never identity proof.
3. `users.oauth_enabled = 1` and the member has active registry access.
4. The session has an approved frontend origin and is not pending.

The reimagined frontend linking flow supplies a Clerk JWT as `clerkToken`. Earlier clients supplying only `clerkUserId` must refresh before linking; existing explicit links continue to work. Deploy backend first, then frontend, and ask an already-open old client to refresh if linking returns 400. Removed email auto-linking is an intentional security correction; first-time Google users sign in with a member token and explicitly link in Profile. Audit historical links before importing live records into personal staging.
# Reimagined project access change

Device sessions are additive: existing registry Bearer tokens remain accepted, and `/api/dev-login` retains its development-only contract. New web sign-in uses production-capable `/api/auth/session`, retaining existing storage keys but storing an expiring session instead of the source token. Backend must be deployed before the updated frontend; old frontend/backends cannot consume the new session credential format. Roll back the frontend first or require users to sign in again before reverting a backend without session support. Leave the additive table intact during rollback. The Google exchange uses verified explicit linking. A synthetic real-SDK route test covers identity and database enforcement; live personal Clerk OAuth and browser acceptance remain required.

Internal project lists/counts no longer expose every project to members without a department. Such users need an explicit project role; board access and assigned-department access remain. Cross-department explicitly assigned members gain project visibility. Direct task reads enforce this scope and return 404 for inaccessible/missing projects. Task responses add `can_update`; assignees may update their own task status. Public completed-project endpoints are unchanged. Existing clients must handle denied reads and missing tasks rather than rely on unrestricted ID access.

## Reimagined persistent rate limits

Existing endpoint thresholds and 429 response conventions remain. Limits now persist in the existing `rate_limits` table across worker restarts and deployments. Successful development login consumes one attempt and does not clear previous attempts; failures are counted once. This intentionally closes restart/reset bypasses. Clearing the table during deployments would defeat enforcement and must be avoided. No schema migration or new binding is required.

## Reimagined Club Files namespace correction

General, Projects and Events UI flows retain their routes and power thresholds. Arbitrary categories, nested objects and Letter Studio documents are excluded from the shared library; existing data is not deleted or moved. Unknown category requests now return 400; direct private/partial/ambiguous IDs return 404. Download filenames use RFC 5987 encoding and responses disable caching. Inventory unexpected historical categories before personal data import; migrate approved ones deliberately rather than exposing the bucket root. Letter Studio's own routes remain unchanged.

## Today queue rollout

`GET /api/work-queue` is additive and uses existing schema. Deploy backend before frontend; old clients keep their dashboard payload. New frontend displays a visible error if the queue endpoint is unavailable, while existing dashboard sections remain accessible. No stored data or existing routes are renamed. Project deadlines retain their existing meaning; they are not task due dates.

The existing task status PUT and schedule-only PATCH retain their contracts. The combined `/details` PATCH is additive and requires an expected-value snapshot. Creation rejects inactive assignees and rechecks eligibility at insert time. Existing task records, completion timestamps and scheduled dates are not rewritten by deployment.
