# Compatibility Contracts — 180DC VIT Chennai Platform

These contracts are the surfaces that external systems, the frontend, and club members depend on. Do not break them without an explicit migration plan.

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

`apps/frontend/functions/_middleware.ts` proxies `/api/*` to `admin-api.technical-vitc.workers.dev`. Any change to the backend origin must be mirrored here and tested on a preview deployment.

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

- SMTP sends are capped at 500 messages/hour (`email_hour_count`). Every queued campaign is one message per recipient; no campaign uses BCC batches.
- The Resend fallback is capped at 100 recipients/day (`resend_daily_count`).
- Subscriber emails carry a per-recipient `/unsubscribe/<token>` link and RFC 8058 one-click `List-Unsubscribe` headers.
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
2. The Clerk Backend API returns a Clerk-verified email for the Clerk user, and that email matches `users.email` (client-supplied emails are ignored).
3. `users.clerk_user_id` is empty (link via verified email) or equals the JWT's `sub` and matches a verified email; one Clerk user ID may be linked to at most one user.
4. `users.oauth_enabled = 1`.

Linking (`POST /api/auth/link-clerk`) requires a valid Clerk JWT (`clerkToken`) in the body; the server links the JWT's `sub` and rejects client-supplied Clerk user IDs. Do not change this logic without updating the frontend linking flow.

## COMP-AUTH-01 Token login contract

- `POST /api/auth/token-login` accepts `{ token }` and validates it against `admin_tokens` (unrevoked + unexpired). Success returns the same profile shape as clerk-login.
- The frontend must call `/api/auth/token-login`, never `/api/dev-login` (the latter is disabled when `ENVIRONMENT=production`).
- Invalid/expired tokens return 401; rate limit is 10/min per IP (429).

## COMP-AUTH-02 Auth failure status codes

- 401 = authentication refused: invalid/expired Clerk JWT or admin token, unlinked/unknown member, `oauth_enabled = 0`, no verified email on the Clerk account.
- 403 = the caller is authenticated but lacks permission (power-level gates).
- 409 = Clerk user ID already linked to another member.
