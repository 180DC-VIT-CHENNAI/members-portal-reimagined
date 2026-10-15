# Testing Strategy — 180DC VIT Chennai Platform

## Current state

The repository has **no automated tests**. Verification today is manual or through Wrangler local dev. This document records what exists, what is missing, and the minimum tests that should be added before risky changes.

## What must be verified manually today

- `pnpm turbo run build` builds the frontend.
- `pnpm tsc --noEmit` inside `apps/admin-api` type-checks the Worker.
- `pnpm wrangler dev` inside `apps/admin-api` runs the worker locally.
- `pnpm dev` inside `apps/frontend` runs the Vite dev server.
- Manual endpoint testing with a valid admin token.
- Manual D1 inspection and migration testing.

## Test taxonomy

### Unit tests

Run in Node with a test runner (e.g., Vitest). Candidates:

- `sanitizeStr` and `sanitizeBlogHtml`.
- `escapeHtml` and `escapeForJson`.
- `isValidUrl`.
- `validateEmail`.
- `checkRateLimit` logic (with a mock D1).
- `getTodayEmailCount` and `incrementEmailCount`.

### Integration tests

Run against a local `wrangler dev` instance or a Miniflare D1 mock. Candidates:

- `TEST-AUTH-01` — public routes return 200 with no token.
- `TEST-AUTH-02` — protected routes return 401 with no token.
- `TEST-AUTH-03` — login with valid token returns user profile.
- `TEST-AUTH-04` — revoked token returns 401.
- `TEST-AUTH-05` — maintenance mode blocks non-board members.
- `TEST-RATE-01` — rate limit returns 429 after exceeded.
- `TEST-QUOTA-01` — SMTP sends stop at 500 messages/hour; remaining recipients are reported as `queued`/stored in `pending_emails`.
- `TEST-PROJECT-01` — board can create a project; member cannot.
- `TEST-PROJECT-02` — completed project regenerates `static/completedProjects.json`.
- `TEST-TEAM-01` — adding a member beyond `member_limit` returns 400.
- `TEST-NEWS-01` — newsletter send delivers one message per active subscriber with that subscriber's `/unsubscribe/<token>` link, skips subscribers who unsubscribed after queueing, records `email_deliveries`, respects the hourly SMTP cap, and updates `recipient_count`.
- `TEST-NEWS-02` — `POST /api/newsletter/unsubscribe/:token` with a form body and no `Origin` (as mail providers send it) unsubscribes; `retry-failed` re-sends only `failed` deliveries.
- `TEST-MEET-01` — meet link hidden after 24 hours.

### End-to-end tests

Use Playwright or similar against the local frontend and worker:

- Public visitor can see landing page and subscribe.
- Member can log in with token and see dashboard.
- Board member can create a project and assign members.
- Director can schedule a department meet.

### Contract tests

For each `COMP-*` in `docs/compatibility/compatibility-contracts.md`, verify the contract before and after the change. Priority:

- `COMP-API-01` public routes.
- `COMP-AUTH-01` token contract.
- `COMP-UI-01` storage keys.
- `COMP-DEPLOY-01` Pages middleware proxy.
- `COMP-EMAIL-01` from addresses and `COMP-EMAIL-02` quotas/batching.

## Recommended test harness

Add `vitest` to the root dev dependencies and create:

- `packages/test-utils/` — helpers for creating a mock D1 environment and seeded users.
- `apps/admin-api/__tests__/` — unit and integration tests.
- `apps/frontend/e2e/` — Playwright tests.

### Mock environment

A test helper should set:

- `DB`: in-memory D1 with schema from `ensureTables` and `runMigrations`.
- `CLUB_FILES`, `BLOG_IMAGES`, `CASE_STUDIES`: in-memory R2-like mock.
- `RESEND_API_KEY`: a fake key; capture calls instead of sending.
- `CLERK_SECRET_KEY`: a fake key; mock `verifyToken`.

### Seeded test data

A `seed.ts` should insert:

- 12 roles from the system seed.
- 6 departments.
- 1 board user, 1 director, 1 member, 1 advisory.
- A few projects, meets, and newsletter subscribers.
- One active token per seeded user.

## Quality gates

Before a pull request is merged, the following should pass:

1. `pnpm install`.
2. `pnpm turbo run build`.
3. `cd apps/admin-api && pnpm wrangler deploy --dry-run` (compiles and bundles the Worker).
4. Lint if configured.
5. New or updated tests pass.
6. Manual smoke test of the affected capability.

## Known debt

- No lint or format scripts in root `package.json`.
- No GitHub Actions or CI.
- No `.dev.vars.example` with all required keys.
- No `wrangler.toml` for local testing of all apps.

## Exit criteria

The testing strategy is complete when:

1. Unit tests exist for all pure helpers.
2. Integration tests cover every public endpoint and every auth boundary.
3. At least one end-to-end test runs in CI.
4. Every `INV-*` and `COMP-*` has at least one automated test.
