# Testing Strategy — 180DC VIT Chennai Platform

## Current state

`tests/` holds an end-to-end suite for the admin-api: 215 tests covering every route
(see `tests/README.md` for the feature map and the known bugs it found). Run it after every
backend change:

```bash
pnpm test                                  # emails captured, none sent
TEST_EMAIL=you@example.com pnpm test:mail  # also deliver one of each email to you
```

Each run starts `wrangler dev` on a fresh local D1/R2, creates one account per role
(board, director, member, advisory) and exercises the API over HTTP. Emails go through
the dev-only `EMAIL_TEST_MODE` (ignored in production), so tests can assert on recipients,
bodies, unsubscribe links and OTP codes without emailing anyone real.

There is no frontend (browser) test suite yet, and no unit tests. The rest of this
document is the original plan; the integration items below are now covered by `tests/`.

The reimagined policy modules (`apps/admin-api/*.test.mjs`, `apps/frontend/functions/_middleware.test.mjs`, `apps/mobile/src/*.test.mjs`) also have `node --test` unit tests, and `apps/frontend/tests/` has Playwright browser tests for the Today and task-schedule views.

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
- `SPACEMAIL_SMTP_USER` / `SPACEMAIL_SMTP_PASS`: leave unset to exercise the "not configured" path, or use the real mailbox when testing delivery.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_TOKEN_URL`: the e2e harness points these at a fake local token endpoint (`tests/lib/server.mjs`).

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
## Reimagined proxy and origin verification

### Project permissions and owned task journeys

With the isolated local Worker running and local auth fixtures loaded, execute `pnpm wrangler d1 execute DB --local --file ../../scripts/fixtures/local-projects.sql` in `apps/admin-api`, then run `pnpm run verify:local-projects` from the root. Reload the project fixture before repeat runs because the test revokes one synthetic role. It exercises scoped list/count/direct reads for four roles, cross-project IDs, immediate membership revocation, owned-task complete/reopen/retry, other-assignee denial, missing tasks, invalid status and invalid assignees. The fixture must never be applied remotely.

These API checks, Turbo build, frontend build and Worker dry-run passed in Boat on 8 October 2026. Local D1 inspection confirmed actual status changes persisted with matching actor/from/to audit records and a repeated completion added none. Browser interaction/visual verification remains open; compilation alone does not prove the new controls' UX.

Run `pnpm run test:proxy` with Node 24 or later. These tests exercise the real Pages middleware with mocked upstream transport: configured/default routing, query/body/auth forwarding, CSP, fail-closed configuration, static assets and SPA fallback. They do not establish backend permissions or full product acceptance.

Run `pnpm run test:origins` for exact additional HTTPS origin matching, unrelated-origin rejection and malformed/wildcard configuration. These are policy tests; exercise Hono CORS/CSRF integration against the local Worker separately.

Run a local Worker with `ALLOWED_WEB_ORIGINS=https://personal.example`, then `pnpm run verify:local-origins`. The script only accepts a loopback API host and checks schema bootstrap, missing/invalid token rejection, allowed preflight/JSON validation and unrelated-origin JSON write rejection.

After schema bootstrap in an isolated local D1, run `pnpm wrangler d1 execute DB --local --file ../../scripts/fixtures/local-auth.sql` from `apps/admin-api`, then `pnpm run verify:local-auth` from the root. The synthetic fixture uses reserved `.invalid` emails and verifies role authentication, board restriction, advisory exclusion and expired/revoked tokens. Never apply the fixture remotely. These checks passed in Boat on 8 October 2026, alongside the Turbo frontend build and Worker dry-run. Backend `tsc --noEmit` still needs a tsconfig and currently exits with compiler help.

### Device sessions and member lifecycle

Run `pnpm run test:sessions` with Node 24 or later for random credential generation, hashing and fail-closed registry expiry handling. After local schema bootstrap and loading `local-auth.sql`, run `pnpm run verify:local-sessions`. The script rejects remote hosts and uses local Wrangler D1 for synthetic expiry, role and parent-token changes. For a separate empty database, start Wrangler with `--persist-to /path/to/isolated-state --var ENVIRONMENT:production`, bootstrap `/api/departments`, load the auth fixture with the same persistence path, and run the script with `LOCAL_API_URL` and `LOCAL_D1_STATE` set accordingly. Never import these fixtures remotely.

Both existing-schema and fresh production-mode runs passed in credential-free Boat on 8 October 2026. Coverage includes independent credentials, hash-only persistence, account-scoped listing/revocation, source revoke/rotate, current roles, expiry, logout, member removal without sign-in recreation and transactional audit rows. Eight helper/proxy/origin tests passed. Turbo/frontend builds and Worker dry-run passed. Live Google identity verification, browser interactions and Android secure storage remain unverified.

### Google identity and link ownership

Run `pnpm run test:google-oauth` for PKCE and ID-token validation (`apps/admin-api/google-oauth.test.mjs`). `pnpm test` (`tests/api/01-auth.test.mjs`) drives the real Worker through start, callback and exchange against a fake Google token endpoint: state cookie and single-use state, unlinked accounts, link then sign-in, single-use handoff codes, duplicate links, unlink and revoked registry tokens.

The Clerk-based `verify:local-clerk` script below was removed with Clerk; the paragraphs that cite it are historical records. Use `pnpm test` for route coverage instead.

These identity route journeys passed in credential-free Boat on 8 October 2026, including missing registry access, disabled OAuth, audit rows and repeated-request rate denial. All twelve policy/proxy/session helper tests passed, as did Turbo/frontend builds and Worker dry-run. Existing backend `tsc --noEmit` still has no usable tsconfig; type-check setup remains open.

### Persistent rate-limit enforcement

Run `pnpm run test:rate-limits` with Node 24+. It executes the actual limiter SQL against SQLite, exercising concurrent consumption, distinct keys, saturated denied counts, window expiry, persistence after reopening the database, invalid policy and unavailable-state denial. `pnpm run verify:local-clerk` additionally verifies limits in real local D1: restart the production-mode local Worker with the same state and confirm link denial persists; twenty concurrent invalid session attempts from a separate synthetic IP permit exactly ten attempts and deny ten with 429. This uses isolated fixtures and never clears live counters.

On 8 October 2026, these tests and endpoint checks passed in credential-free Boat, along with all fifteen helper tests, Turbo/frontend builds and Worker dry-run. Limits preserved across a real Worker restart and twenty concurrent session attempts produced exactly ten 401 validation outcomes and ten 429 denials.

### Shared R2 library boundaries

Run `pnpm run test:club-files` for approved namespaces, nested/private exclusions, full ID matching, ambiguity, continuation pages and safe download headers. The hermetic `pnpm run verify:local-clerk` fixture now also provisions only a local R2 bucket: it seeds synthetic Letter Studio/nested objects, exercises shared category uploads, role denials, list/filter APIs, downloads, private ID denial and delete, then confirms the private fixture remains intact. All R2 CLI operations use `--local` and the test persistence directory. The test deletes its state on exit. Contextual attachment ownership and live browser acceptance remain separate work.

On 8 October 2026, local R2 endpoint checks passed in credential-free Boat with all eighteen helper tests, Turbo/frontend builds and Worker dry-run. Only synthetic objects/local D1 were used; no cloud object or mail was touched.

### Today queue

The hermetic `pnpm run verify:local-clerk` suite also loads synthetic projects and meetings and verifies the work queue for board/director/member/advisory. It checks inaccessible assigned tasks, project-role removal, department movement, completed-task exclusion after a real status update, recipient-only transfers, board attention and meeting scope. The suite uses isolated local D1/R2 and tears down its temporary state. Frontend compilation alone does not prove Today interaction/visual/accessibility acceptance; browser acceptance remains open.

Today endpoint journeys, all eighteen existing helper tests, Turbo/frontend builds and Worker dry-run passed in credential-free Boat on 8 October 2026. The final frontend includes direct assignee completion and ignores stale credential responses. Live/browser UX and accessibility checks are still required.

### Today browser component acceptance

Install dependencies with `pnpm install`, install the test browser using `pnpm --filter frontend exec playwright install chromium`, then run `pnpm --filter frontend run test:browser`. Playwright starts a dedicated loopback Vite fixture server with no production proxy or account keys. The fixture mounts the actual Today component/styles; requests are intercepted with synthetic responses and all other external/API traffic is blocked. This follows Playwright's [network mocking](https://playwright.dev/docs/mock) and [managed web server](https://playwright.dev/docs/test-webserver) patterns.

Ten Chromium checks passed in credential-free Boat on 8 October 2026: desktop/mobile keyboard task completion, transfer/admin shortcuts, errors and refresh recovery, denied completion/retry, delayed old-account responses, loading/empty states, unsafe meeting links and long-title overflow. Visual inspection caught low-contrast inherited button labels; Today now uses primary text and more section spacing. Screenshots are saved in ignored `test-results`; failure traces are retained. Dependency install and final Turbo/frontend builds passed.

These are actual-component browser checks with mocked responses. They complement the real local Worker/D1/R2 endpoint suite but do not prove a complete portal login journey, real Google redirects, CSP deployment behavior, all accessibility criteria or Android parity. Full end-to-end staging acceptance remains required.

### Initial Android verification

Run `pnpm --filter mobile check`, `pnpm --filter mobile test` and `pnpm --filter mobile exec expo export --platform android`. The three transport tests exercise HTTPS origin rejection, source-token exchange, session Bearer requests, task ID encoding and preserved 401 status. These checks and the Android JavaScript export passed in credential-free Boat on 8 October 2026; root Turbo and explicit frontend builds passed with the additional workspace dependencies. Device/emulator UI, SecureStore/Keystore, offline/storage errors, background expiry, push, file handling and signing remain unverified. Follow ADR-006 and the capability matrix; do not report export as installable-app acceptance.

Mobile restoration now validates stored credential structure and expiry before any protected view is restored. Additional unit checks cover malformed/legacy/expired storage, unrelated field stripping, non-JSON 401 preservation and malformed-success rejection. These are JavaScript lifecycle/transport checks; native SecureStore failure and device teardown acceptance remain open.

The expanded six mobile tests, type check, Android export and web regression builds passed in Boat on 8 October 2026. KVM and adb were observed available in the VM; no emulator boot or native storage acceptance has yet occurred.

Android Today response validation: seven mobile tests pass locally, including malformed queue shapes, invalid attention counts and preservation of both truncation flags. The native screen displays the backend limits and points to the web sections for additional results. Screen/device acceptance remains open.

Android session-control increment: nine mobile tests, TypeScript check, Android export (585 modules) and Turbo/frontend builds passed in credential-free Boat on 8 October 2026. Tests cover session list validation, authenticated owned-session DELETE with encoded IDs, and malformed issuance rejection. They do not exercise React Native Alert, screen transitions, stale-response handling or SecureStore deletion on a device; those acceptance checks remain required. Explicit `.ts` import support is enabled for the no-emit compiler so the decoder also runs in Node transport tests.

Task scheduling increment verified in credential-free Boat on 8 October 2026: fifteen backend helper tests; hermetic local production-mode Worker checks for task creation, calendar validation, partial schedules, lead/member scope, PATCH preflight, wrong-project IDs, queue ordering and no-op transactional audit; fourteen Chromium checks across desktop/mobile, including the actual schedule editor and member-only status controls; nine mobile tests, type check and Android export; Turbo/frontend builds and Wrangler dry-run. The isolated fixture temporarily removes only its own new task columns, restarts the Worker and confirms runtime migrations preserve the older task and add null due date/normal priority. Never apply that fixture procedure to a remote database. Native UI and full deployed portal acceptance remain pending.

Combined task ownership increment passed in credential-free Boat on 8 October 2026: the hermetic API suite verifies member/director denial, expected-value requirements, inactive/expired/out-of-project owners, wrong-project IDs, atomic owner/date/priority, old/new owner work queues and completion permissions, unassignment, before/after attribution, no-op audit preservation and one winning concurrent edit. Eighteen Chromium checks cover desktop/mobile task editing, member control restrictions, conflict draft/reload and delayed account-switched task responses alongside existing Today journeys. Turbo/frontend builds and Worker dry-run passed. Native editing and deployed full-portal acceptance remain open. Confirm Chromium availability after a Boat resume; the resumed VM required `playwright install chromium`.

Task history evidence: 22 Chromium checks passed on 8 October 2026, including timeline attribution/paging and clearing displayed history after a non-JSON access denial. The hermetic local Worker verifies current project scope, task-project IDs, safe actor/field projection, malformed/unrelated audit exclusion, multiple pages without duplication and append ordering for 55 same-second events. On 9 October, creation and bulk-completion endpoint checks, sixteen backend helper tests, Turbo/frontend builds and Worker dry-run passed. Bulk tests confirm per-task events, denied member writes, preserved existing completion timestamps and no additional retry events. Native history and hosted portal acceptance remain pending.
