# Compatibility Contracts — 180DC VIT Chennai Platform

## COMP-PORTAL-WORK-01 Additive collaboration

Existing project/task URLs and Google sessions remain valid. Existing task status requests for `pending`/`completed` remain valid; `blocked` requires a reason. Existing project creation defaults to non-internal, preserving publication semantics.

The portal's old department create/status routes operate on canonical internal projects. Existing portal department records are copied without deleting source rows, and their old IDs resolve through `legacy_department_project_id`. This does not import records from the legacy Worker. No registry token, OTP or old session gains access.

## COMP-PORTAL-LETTERS-01 Official documents in the fresh portal

The `/letters` surface remains, but authenticates with the existing Google personnel session and named permissions. New APIs live under `/api/letters`; legacy `/api/letter-studio/*` and OTP credentials remain confined to the old Worker. No credentials or old PDFs are imported.

All 13 templates and their fields are retained. Save, local download/print and email are separate deliberate operations; a download does not silently upload or open Send. PDF storage is private and immutable. Printed references retain the deterministic, non-unique legacy semantics; signature marks are not digital certificates.

## COMP-PORTAL-NEWS-01 Fresh newsletter identity and URLs

The Void portal intentionally starts with no legacy subscriber, editor session or unsubscribe/confirmation credentials (ADR-009). The legacy Worker keeps its existing JSON contracts. The new portal uses its own documented APIs, Google editor permissions, `/subscriber?confirm=`, `/unsubscribe/:token`, `/newsletter` archive, and `/newsletter-editor`; signed-in `/subscriber/newsletter` redirects to that editor.

Email-entry unsubscribe now requests a personal link rather than unauthenticated removal by address. Public issue detail hides drafts. Mail links are built from the sending portal request's origin. Before moving a hostname used by old mail, review old-link continuity explicitly: a blank database cannot honor credentials issued by the other deployment.

These contracts are the surfaces that external systems, the frontend, and club members depend on. Do not break them without an explicit migration plan.

## COMP-PORTAL-CUTOVER-01 One hostname, fresh portal

`180dc.vitcc.org` reaches the Void portal. The blank portal does not honor credentials or links the old Worker issued on this hostname: registry-token and OTP sign-ins, member sessions, newsletter confirm/unsubscribe links and legacy `/api/*` paths. Members re-enter through Google sign-in with an invited email. The old Worker's D1 and R2 data are unchanged until its retirement is approved. The club deployment configured by `apps/admin-api/wrangler.toml` and Cloudflare Pages is separate and unaffected.

## COMP-PORTAL-UI-01 Separate Void portal home and task activity

The contracts below describe the legacy deployment. While both Workers run, it keeps those contracts; the Void portal's API is documented separately in `apps/portal/README.md` and the portal sections of `api-contract.md`.

- In the Void portal, `/me` and a successful sign-in without an explicit local `next` destination open `/today`. Existing project, directory and profile routes remain reachable; the phone tab bar moves Announcements into More.
- Task comments/history use current Google sessions and the project visibility policy. They do not accept registry tokens or expose the global audit log. A failed access refresh discards private feed data.
- The portal's `GET /api/today` replaces its dashboard/work-queue UI with task, meet, announcement and permission-scoped attention data; obsolete token registries, signup requests and role-transfer panels are not recreated.

## COMP-API-01 Public API routes must remain functional

The following routes are called by the public website without authentication. They must continue to return the same JSON shape and status codes.

- `GET /api/content/case-studies`
- `GET /api/content/team-members`
- `GET /api/content/partners`
- `GET /api/newsletter`
- `POST /api/newsletter/subscribe`
- `GET /api/newsletter/unsubscribe` (legacy `?email=` links in already-sent emails)
- `POST /api/newsletter/unsubscribe/:token` (tokens are embedded in sent emails and `List-Unsubscribe` headers; never rotate or change their format)
- `GET /api/newsletter/subscribers/count`
- `GET /api/departments`
- `GET /api/projects/completed`
- `GET /api/case-studies/images/*`
- `GET /api/admin/maintenance`
- `POST /api/signup-requests`
- `POST /api/consulting-request`
- `POST /api/dev-login`
- `GET /api/auth/google/start`, `GET /api/auth/google/callback`, `POST /api/auth/google/exchange`
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
- `/members` — members portal.
- `/members/*` — members portal sub-pages.
- `/subscriber` — newsletter subscriber page (email double opt-in; `?confirm=<token>`).
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
- `SPACEMAIL_SMTP_USER`
- `SPACEMAIL_SMTP_PASS`
- `GOOGLE_CLIENT_SECRET` (secret) and `GOOGLE_CLIENT_ID` (var)
- `ENVIRONMENT`

## COMP-DATA-01 Table and column names

The D1 table and column names in `docs/contracts/data-model.md` are a compatibility surface. Any rename requires a migration that preserves old names as views or a coordinated frontend/backend rollout.

Special attention:

- `users.email` must remain unique.
- `admin_tokens.token` is the primary key and `email` is unique.
- `project_departments` and `instance_departments` composite keys.
- `daily_email_count.date` is the primary key.

## COMP-EMAIL-01 Sender addresses and templates

Emails are sent from these addresses and use the 180DC VIT Chennai branded template. Changing the from address, provider, or template shape may affect deliverability. Spacemail SMTP is the only provider.

- `180DC Admin <technical@180dcvitc.org>`
- `180DC Consulting <technical@180dcvitc.org>`
- `180DC Newsletter <technical@180dcvitc.org>`
- `180DC Events <technical@180dcvitc.org>`
- `180DC Letter Studio <technical@180dcvitc.org>`

## COMP-EMAIL-02 Send quotas and batching

- SMTP sends are capped at 500 messages/hour (`email_hour_count`). Every queued campaign is one message per recipient; no campaign uses BCC batches.
- Subscriber emails carry a per-recipient `/unsubscribe/<token>` link and RFC 8058 one-click `List-Unsubscribe` headers.
- Changing these caps or the batching model requires coordination with the email provider and a docs update.

## COMP-R2-01 Bucket keys

The following key patterns are used in R2. Do not change them without a data migration.

- `BLOG_IMAGES`: `static/completedProjects.json`
- `CLUB_FILES`: `<category>/<uuid>.<ext>`
- `CASE_STUDIES`: `images/<uuid>.<ext>`, `source/<uuid>.<ext>`

## COMP-GOOGLE-01 Google OAuth client

The Worker needs `GOOGLE_CLIENT_ID` (var in `wrangler.jsonc`) and `GOOGLE_CLIENT_SECRET` (Worker secret). Every deployed origin's `<origin>/api/auth/google/callback` must be registered as an authorized redirect URI on the OAuth client; production uses `https://180dc.vitcc.org/api/auth/google/callback`.

## COMP-GOOGLE-02 Linked account contract

A Google sign-in is valid only when exactly one `users.google_sub` matches the verified ID-token subject, `users.oauth_enabled = 1`, and the member has active registry access. Client email is never identity proof.

## COMP-CLERK-REMOVED Clerk removal

Clerk was removed from the frontend and Worker. `/api/auth/clerk-login`, `/api/auth/link-clerk` and `/api/auth/unlink-clerk` no longer exist, `VITE_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` are unused, and the Clerk hosts were dropped from the CSP in `apps/frontend/public/_headers` and `apps/frontend/functions/_middleware.ts`. Clerk user IDs are not Google account IDs, so former links do not carry over: those members sign in with their token once and click "Link Google Account" in Profile. `users.clerk_user_id` stays as an unused legacy column.

## COMP-NEWS-SUBSCRIBE Double opt-in

`POST /api/newsletter/subscribe` no longer activates the address or says "already subscribed"/"welcome back"; it always returns `{ success, pending: true, message }` and emails a confirmation link. Clients must call `POST /api/newsletter/confirm` with the link's token. Existing active subscribers are unaffected.
# Reimagined project access change

Device sessions are additive: existing registry Bearer tokens remain accepted, and `/api/dev-login` retains its development-only contract. New web sign-in uses production-capable `/api/auth/session`, retaining existing storage keys but storing an expiring session instead of the source token. Backend must be deployed before the updated frontend; old frontend/backends cannot consume the new session credential format. Roll back the frontend first or require users to sign in again before reverting a backend without session support. Leave the additive table intact during rollback. Google sign-in uses the Worker OAuth flow in COMP-GOOGLE-02 and is covered by `tests/api/01-auth.test.mjs`; a real Google sign-in must still be checked on each release that touches auth.

Internal project lists/counts no longer expose every project to members without a department. Such users need an explicit project role; board access and assigned-department access remain. Cross-department explicitly assigned members gain project visibility. Direct task reads enforce this scope and return 404 for inaccessible/missing projects. Task responses add `can_update`; assignees may update their own task status. Public completed-project endpoints are unchanged. Existing clients must handle denied reads and missing tasks rather than rely on unrestricted ID access.

## Reimagined persistent rate limits

Existing endpoint thresholds and 429 response conventions remain. Limits now persist in the existing `rate_limits` table across worker restarts and deployments. Successful development login consumes one attempt and does not clear previous attempts; failures are counted once. This intentionally closes restart/reset bypasses. Clearing the table during deployments would defeat enforcement and must be avoided. No schema migration or new binding is required.

## Reimagined Club Files namespace correction

General, Projects and Events UI flows retain their routes and power thresholds. Arbitrary categories, nested objects and Letter Studio documents are excluded from the shared library; existing data is not deleted or moved. Unknown category requests now return 400; direct private/partial/ambiguous IDs return 404. Download filenames use RFC 5987 encoding and responses disable caching. Inventory unexpected historical categories before personal data import; migrate approved ones deliberately rather than exposing the bucket root. Letter Studio's own routes remain unchanged.

## Today queue rollout

`GET /api/work-queue` is additive and uses existing schema. Deploy backend before frontend; old clients keep their dashboard payload. New frontend displays a visible error if the queue endpoint is unavailable, while existing dashboard sections remain accessible. No stored data or existing routes are renamed. Project deadlines retain their existing meaning; they are not task due dates.

The existing task status PUT and schedule-only PATCH retain their contracts. The combined `/details` PATCH is additive and requires an expected-value snapshot. Creation rejects inactive assignees and rechecks eligibility at insert time. Existing task records, completion timestamps and scheduled dates are not rewritten by deployment.
