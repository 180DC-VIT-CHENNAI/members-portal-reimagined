# Implementation Plan — 180DC VIT Chennai Platform

This plan describes the target state and a safe path to reach it. It is not a fixed schedule; it is a dependency map for agents and maintainers.

Active web work is the Void portal rewrite in `apps/portal`, delivered as PRs to origin `main`: see [ADR-007](../architecture/decisions/007-void-portal-rewrite.md) and the [portal port plan](portal-port-plan.md). The earlier [unified platform delivery plan](unified-platform-plan.md) (web/Android on Srijan's personal Cloudflare account) predates that decision. The extraction roadmap below is historical guidance, not a prerequisite to build every placeholder service.

## Target state

For the live portal, the collaboration increment adds atomic emailed invitations, derived onboarding, blocked tasks, a permission-aware inbox, meeting follow-through and contextual files. It consolidates portal department work additively into internal projects and defaults team instances to Roster. Keep one Worker, one portal D1, the existing email queue and configured storage adapter. The service-extraction target below describes the historical legacy system, not required new infrastructure.

The platform should have:

1. A clean separation of concerns:
   - `admin-api` continues to serve the members portal and admin functions.
   - `public-api` becomes a dedicated public API (newsletter, consulting, content, completed projects).
   - `job-processor` becomes a real queue consumer for email batching, bulk operations, and background tasks.
2. A proper database package with versioned, non-destructive migrations.
3. A unit and integration test suite.
4. Spacemail SMTP for all email (one recipient per message); Resend removed.
5. A documented public API surface and stable environment contracts.
6. Reduced single-file size of `apps/admin-api/index.ts` by splitting into routers/modules.

## Current state prerequisites

Before any large restructuring, all existing code and data must be preserved:

- Token-based auth in `admin_tokens`.
- D1 schema in `apps/admin-api/index.ts`.
- R2 keys and bucket names.
- Public routes used by the frontend landing page.
- Frontend `sessionStorage` and `localStorage` keys.
- Wrangler bindings and route patterns.

## Migration roadmap

### Phase 0 — Stabilize documentation and tests

- Keep all existing behavior.
- Add documentation (`AGENTS.md`, this tree).
- Add a minimal test harness and a few integration tests for critical paths (login, rate limits, email quota).

### Phase 1 — Safe schema and code hygiene

- Remove or replace `packages/db/schema.sql` with a migration directory that matches `admin-api/index.ts`.
- Split `apps/admin-api/index.ts` into logical modules (auth, members, projects, meets, newsletter, etc.) without changing routes.
- Add a central route table and auth map.

### Phase 2 — Public API extraction

- Move public endpoints to `apps/public-api/index.ts`.
- Add `wrangler.toml` routes for `public-api`.
- Update `apps/frontend/functions/_middleware.ts` to route public calls to `public-api` while preserving the current `admin-api` proxy for a compatibility window.
- Add compatibility contract tests.

### Phase 3 — Job processor

- Replace `queueOrSendMeetEmails` pending/D1 approach with real Queue messages.
- Implement `job-processor` to consume meet and bulk email jobs.
- Add retry logic and dead-letter handling.

### Phase 4 — Email delivery (Spacemail SMTP only)

- Implemented in `apps/admin-api/index.ts`: `sendEmail()` choke-point, SMTP over
  `cloudflare:sockets`, one recipient per message, `email_hour_count` accounting; the
  Resend fallback has been removed (see `docs/operations/SPACEMAIL_SETUP.md`).
- Remaining operational step: DNS, DKIM, and `SPACEMAIL_SMTP_USER`/`SPACEMAIL_SMTP_PASS`.

### Phase 5 — Continuous improvement

- Add comprehensive tests.
- Refactor frontend to consume new public API cleanly.
- Introduce a shared validation library.

## Exit criteria per phase

| Phase | Done when |
|-------|-----------|
| 0 | Docs merged; at least three critical integration tests pass in CI. |
| 1 | `packages/db/schema.sql` replaced; `admin-api` split into modules; all existing routes still pass. |
| 2 | `public-api` serves public routes; `admin-api` still proxies them during the transition; no frontend breakage. |
| 3 | Queue producer sends messages; `job-processor` consumes and sends emails; `pending_emails` table can be deprecated. |
| 4 | Email sends go through Spacemail SMTP only; quotas enforced in D1. |
| 5 | 80% of API endpoints covered by automated tests; frontend uses new public API. |

## Risk register

| Risk | Mitigation |
|------|------------|
| Splitting `admin-api/index.ts` introduces regressions | Do it module by module; keep the same Hono app and route strings; add contract tests before and after. |
| Moving public routes to `public-api` breaks the landing page | Keep `admin-api` public endpoints as deprecated aliases for one release; test all landing-page fetches. |
| Schema changes break deployed D1 | Every migration is idempotent and `ALTER TABLE ... ADD COLUMN` in a `try/catch`; never drop columns/tables used by current code. |
| Email quota or provider changes cause missed notifications | Keep the `sendEmail()` choke-point; enforce the provider cap in D1 (`email_hour_count`) with 10% reserved for sign-in mail; queue meet emails in `pending_emails`. |
| Losing `admin_tokens` state | Tokens are D1 rows; keep the table and auth middleware intact across all phases. |

## Current branch strategy

- `main` remains deployable at all times.
- Feature work for each phase should happen on a dedicated branch and be merged via pull request.
- Documentation updates (like this tree) live on `docs/agent-first` and merge first.

Unified task scheduling increment: separate calendar due dates and priorities now support web create/edit and shared Today reads, with backward-compatible runtime migrations and transactional schedule audit. Rollout requires personal-account staging acceptance; reassignment, boards, blockers and collaboration remain in the unified plan.

Task owner rollout adds the combined details endpoint and changes assignment validation to active project accounts. No data migration is required. Stage lead reassignment, unassignment and stale-edit recovery with the personal account before release; preserve the schedule-only and status routes.

Task timeline increment: stage scoped paginated history, actor/field projection, same-second ordering and transactionally recorded creation/bulk completion. No legacy event reconstruction is attempted. Keep native history, comments, chat and notifications in the remaining collaboration scope.
