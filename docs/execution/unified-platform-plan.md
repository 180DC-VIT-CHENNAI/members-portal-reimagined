# Unified platform delivery plan

Status: background. Web delivery moved to the Void portal rewrite in `apps/portal` ([ADR-007](../architecture/decisions/007-void-portal-rewrite.md), PRs to origin `main`); the `reimagined` branch now holds only the problem statement. Scope here beyond the [portal port plan](portal-port-plan.md), such as the Android companion, client workspaces and chat, has no active plan. Sponsor and infrastructure owner: Srijan.
Source: `180DC_Unified_Platform_Problem_Statement.md`; implementation baseline: `650048b`.

## Goal and authority

Build the complete core product: modernised public website and member portal, shared backend, Android companion, invited client workspaces, contextual chat, activity and notifications, operational communications, approvals, and recovery tooling. Run the deployed system on Srijan's personal Cloudflare account. Evaluate PlanetScale as a database option before choosing a migration.

The sponsor explicitly authorised implementation, not just discovery. Personal-account ownership overrides the charter's proposed club-account requirement. Preserve existing flows and records through incremental delivery. Real club-data transfer, actual recipient campaigns, public mobile distribution, paid capacity, and retention/moderation policy require concrete decisions when those steps become relevant; implementation and synthetic-data verification can proceed now.

Optional features remain tracked: recurring/dependent tasks, configurable approval engine, analytics, AI, integrations, iOS, and rich chat extras. Assess these after core acceptance; do not silently count a web link as native Android support.

## Architecture direction

1. Keep Vite/React and Hono/Workers initially; evolve the working system.
2. Create isolated personal development/staging/production resources, names and configuration. Remove assumptions about the club's Worker host, domains, sender identities, Clerk instance, R2 URLs and database identifiers. Existing default deployment must remain compatible until deliberate cutover.
3. Keep the two existing D1 databases during baseline work. SQLite SQL and D1 APIs are embedded throughout `admin-api/index.ts`; PlanetScale is a migration project, not a binding substitution.
4. Evaluate D1 against PlanetScale Postgres and MySQL using representative identity, task, search, campaign and transaction queries. Compare correctness, latency, operations and current costs. If selected, connect Workers through Hyperdrive, introduce a tested repository boundary, translate migrations and SQL, rehearse export/import and rollback, and retain one authoritative writer. Never migrate using `packages/db/schema.sql`.
5. Keep R2 for files. Public assets and private attachments need distinct access paths; private downloads recheck resource permissions.
6. Candidate chat design: Durable Objects for ordered room coordination/WebSockets with durable message history, idempotent client message IDs and replay cursors. Decide storage after a tested disconnect/revocation spike.
7. Candidate Android stack: React Native/Expo with shared TypeScript contracts. Validate secure storage, custom backend sessions, notifications, uploads, deep links and PDF flows before adopting. Android binaries run on devices; Cloudflare hosts their services. Push delivery and app signing/distribution may require external providers.
8. Preserve the D1 email queue and current SMTP/fallback/quota rules initially. Add campaign idempotency and observable states before considering Queue migration. Leave placeholder Workers untouched until a justified service boundary exists.

Current integration references: [Cloudflare PlanetScale integration](https://developers.cloudflare.com/workers/databases/third-party-integrations/planetscale/), [Hyperdrive](https://developers.cloudflare.com/hyperdrive/), [PlanetScale Cloudflare integration](https://planetscale.com/cloudflare). Recheck pricing before provisioning; no cost estimate is yet verified.

## Delivery increments

Each increment must record the user journey, permitted roles, source of truth, failure/negative cases, acceptance evidence and rollback. A phase exits only when its stated checks pass.

| Phase | Implementation | Exit evidence |
| --- | --- | --- |
| 0 — Baseline and portability | Inventory actual routes/schema/UI/permissions; establish build and Worker checks; characterise auth, advisory rules, meeting links, files and email limits; isolate personal configuration; database and Android spikes | Reproducible local build, synthetic fixtures, permission matrix, selected database/mobile ADRs, personal deployment checklist |
| 1 — Identity and trust | Device-specific expiring/revocable sessions alongside existing tokens; explicit resource policies; lifecycle revocation; protected downloads; critical-action audit; shared API validation/contracts | Member/director/board/advisory negative tests; role transfer and active revocation verified; existing clients compatible |
| 2 — Daily web work | Role-aware Today view; Home/Work/People/Communications/Resources/Admin navigation; contextual projects/departments/tasks; accessible loading/error/empty states; personal filters | Assignment changes reflected correctly; scoped counts/search; phone and keyboard journeys; baseline regressions |
| 3 — Engagements and knowledge | Intake conversion and accountable triage; scope/milestones/deliverables; internal/client item boundaries; meeting agenda/minutes/action tasks; resource attachments/revisions; onboarding and handover | End-to-end enquiry-to-closure journey; private notes stay private; meeting links expire as before; old/global vs department projects remain distinct |
| 4 — Android core | App workspace; secure sign-in, Today, tasks/projects/departments/meetings/resources/notices/profile; shared contracts; refresh/cache freshness; themes/accessibility | APK/emulator and device evidence; web↔app edits use same record; logout clears sensitive cache; failed writes never show success |
| 5 — Guests and collaboration | Email-bound expiring invitations; guest identity; shared engagement view; member/project/department/client rooms; persisted history/replay/retry; attachments/reporting/mute/unread; in-app activity, push and deep links | Cross-project/guest ID probing denied; revoke closes access; reconnect preserves ordered messages without duplicates; attachments and notification destinations recheck access |
| 6 — Advanced operations and parity | Team/event ergonomics; approval centre; audience notices; publication review; mail/newsletter preview/test/consent/suppression/scheduling and idempotent campaigns; Letter Studio versioning/issue/archive/review; authorised Android operations | Per-capability web/mobile/guest matrix; all selected letter templates visually checked; duplicate sends/issues prevented; quotas and unsubscribe respected |
| 7 — Personal production readiness | Monitoring and cost alerts; backups/restore; rollback; load/reconnect/accessibility review; Android signing/release custody; operator runbooks; personal-account deployment | AC-01–AC-12 evidence; restore and rollback rehearsal; real multi-role pilot; owner can deploy, revoke and diagnose failures |

Dependencies: 0 → 1 → 2 → 3. Android shell can start after contracts/session design in 1; its feature work follows shared APIs. Guests/chat require 1 and engagement boundaries in 3. Production guest chat waits for retention/reporting decisions. Advanced operations may proceed independently where their underlying permissions and contracts are ready. Hardening happens throughout, with final release evidence in 7.

## Feature coverage

| Charter families | Phase(s) |
| --- | --- |
| Public landing, consulting/account requests, case studies, archive continuity | 0, 2, 3, 6 |
| Tokens/Google login, device sessions, directory, member lifecycle, roles, departments/transfers | 0, 1, 2, 3, 4 |
| Global projects, department tracker, tasks/assignments, scope, milestones, deliverables | 2, 3, 4 |
| Team instances/events, meetings/minutes/action items | 3, 4, 6 |
| Files/knowledge, announcements | 1, 3, 4, 6 |
| Newsletter subscribers/editor, Send Mail, 13 letter types | 0, 6 |
| Activity, scoped search, approvals, audit, maintenance/operational health | 1, 2, 5, 6, 7 |
| Contextual chat, guest invitations, client engagement | 3, 5 |
| Android member/guest journeys, push, secure cache, feature parity | 4, 5, 6, 7 |
| Analytics, AI, integrations, iOS, optional automation | Later assessment with explicit acceptance scope |

## Verification and rollout

- Add meaningful automated permission and persistence tests, then journey tests. Current docs report no automated suite; verify actual tooling before introducing one.
- Frontend: `pnpm turbo run build` and `pnpm --filter frontend run build`. Backend: Wrangler dry-run plus local authenticated endpoint tests. `pnpm tsc --noEmit` currently lacks a backend tsconfig; establish a usable type-check command rather than treating help output as success.
- Schema changes: empty local D1 initialisation, repeated migration, existing-data fixture upgrade. Preserve separate newsletter storage, quotas, advisory exclusions and the 24-hour meeting-link rule.
- Exercise retry, concurrency, expiry, removal mid-operation, wrong role, unrelated project IDs, private attachment paths, malicious content and failed provider paths from charter §13.
- Use synthetic members/clients and disabled or test-only delivery for development. Rehearse deployment in isolated personal staging before production. Do not assume existing club resources belong to the sponsor.
- Record AC-01–AC-12 evidence, build output, unresolved failures and rollback steps per increment. No release claims based solely on compiling.

## Decisions to resolve when needed

| Decision | Interim implementation position |
| --- | --- |
| Personal account, domain and environment names | Personal ownership confirmed; exact account/domain/resource IDs still need verification |
| D1 vs PlanetScale; Postgres vs MySQL | Keep D1 until compatibility/cost spike supports a choice |
| Existing data migration | Synthetic staging first; no club-data import assumed |
| Android stack and distribution | Validate Expo/React Native; closed APK pilot before public listing |
| Guest invitation authority and expiry | Explicit project owner/board permission; deny access until verified invitation acceptance |
| Message retention, report review and project closure access | Design configurable policy; production enablement waits for owner values |
| Formal letter approval/numbering/retention | Draft versus issued is explicit; numbering and approver policy need owner values |
| Monthly spend, sender identity and push provider | Measure usage and current pricing before paid provisioning or real sends |

## Progress ledger

- [x] `reimagined` tracks `origin/reimagined`; clean baseline pulled at `650048b`.
- [x] Active goal created; charter read; current-state/deployment/architecture and source entry points inspected.
- [x] Personal hosting recorded as the sponsor's explicit requirement.
- [x] Code confirms Send Mail and Letter Studio exist; PDF browser rendering and local history are present. Runtime/template accuracy remains unverified.
- [x] Identified hardcoded Pages proxy, origin allowlist, account-specific bindings and D1 SQL coupling as initial portability work.
- [x] Dependency install and `pnpm turbo run build` passed in a credential-free Boat VM on 8 October 2026. Frontend TypeScript/Vite and final Worker Wrangler dry-run also passed. Local install timed out on registry requests.
- [x] Initial resource/permission source matrix saved in `unified-baseline-audit.md`; synthetic local auth fixtures verify member/director/board/advisory, revoked and expired tokens. Full route coverage remains open.
- [x] Configurable Pages `API_ORIGIN`, backend `ALLOWED_WEB_ORIGINS`, personal Wrangler example and six automated tests implemented. Local Hono checks verify allowed preflight/JSON writes and forbidden-origin rejection. Found and fixed a JSON-origin gap in the existing CSRF layer.
- [ ] Complete resource-level permission negative tests and session implementation.
  Project list/dashboard count/direct task read boundaries are implemented and verified for board/director/member/advisory. Explicit-role removal takes effect immediately on the next request. Assigned members can complete/reopen tasks in the web UI; retry timestamps and transactional audit rows were verified. Task assignees must have project access; missing/wrong-project tasks cannot report success. Turbo build, frontend build and Worker dry-run passed in Boat. Remaining: file/resource boundaries, broader lifecycle coverage and browser UX.
- [x] Device session API and web account controls implemented: independent hashed credentials, seven-day expiry, own-session listing/revocation, logout, parent-token invalidation and current-role checks. Synthetic endpoint journeys passed against existing and fresh production-mode local D1, including member removal and transactional session audit. Browser/provider acceptance and Android integration remain open.
- [x] Removed client-email Google auto-linking and arbitrary-ID linking. Both Google routes require verified Clerk session identity and approved origin; links require existing member auth and reject conflicts atomically. Revoked/expired/missing registry access cannot be restored through OAuth. Real-SDK ephemeral-key route verification passed against fresh production-mode local D1, including concurrent links and transactional audit. Twelve helper tests, Turbo/frontend builds and Worker dry-run passed. Live provider/browser acceptance remains open.
- [x] Restored atomic D1-backed limits using the existing table and unchanged thresholds. Real local Worker restart and concurrent endpoint checks passed; fifteen helper tests, Turbo/frontend builds and Worker dry-run passed. Development login counts each attempt once and no longer clears successful attempts. Rate-limit retention/capacity monitoring remains a rollout task.
- [x] Isolated shared Club Files from Letter Studio/private/nested R2 namespaces. Approved categories, exact-ID lookup, continuation scans and safe download headers implemented; local R2 API tests confirm shared operations, role restrictions and private object preservation. Eighteen helper tests, Turbo/frontend builds and Worker dry-run passed. Contextual metadata/ownership APIs and browser acceptance remain open.
- [x] Initial Today API and web card implemented with scoped assigned tasks, real task completion, labeled project deadlines, next-seven-day meetings, own transfer invitations and board account approvals. Role/department changes and completion were verified through local endpoints. Existing eighteen tests, Turbo/frontend builds and Worker dry-run passed. Browser acceptance, task-level scheduling, department blockers/reviews, unread/mentions and activity remain open.
- [x] Repeatable Today Playwright harness and locked test dependency added. Ten desktop/mobile component checks passed, including keyboard completion, failure recovery, stale-account response suppression, shortcuts and overflow. Fixed long-title wrapping and scoped button contrast/spacing after visual inspection. Full portal/provider/staging accessibility acceptance remains open.
- [ ] Confirm personal account and provision isolated resources; no cloud production deployment has occurred.
- [x] Database desk evaluation recorded in ADR-005: current provider pricing/limits, source coupling, transactional translation, security caching and cutover/rollback gates. D1 retained for development; no paid resource created. Hosted comparative benchmarks and production capacity/quote remain open.
- [x] Android Expo SDK 57 member client added with secure device credential storage, explicit personal HTTPS origin, Today/task completion, foreground refresh and logout/expiry teardown. Mobile type check, three transport tests, Android JavaScript export and web regression build passed. ADR-006 and capability evidence matrix added. APK/device/storage acceptance and broader workflow parity remain open.
- [x] Hardened Android restoration against malformed/legacy/expired saved credentials and non-JSON 401 responses. Six mobile tests, type check, Android bundle export and web regression builds passed. Boat exposes KVM and adb; emulator installation/boot and native storage/lifecycle acceptance remain open.
- [x] Android Today now validates response shapes and preserves/displays backend truncation flags instead of presenting limited results as a complete queue. Seven mobile tests pass locally; native screen acceptance remains open.
- [x] Android signed-in session list and owned-device revocation implemented with confirmation, current-device credential teardown and stale-account request guards. Session issuance/listing shapes are validated before use. Nine mobile tests, TypeScript check, Android JavaScript export and Turbo/frontend regression builds passed in credential-free Boat. Native confirmation, SecureStore deletion and lifecycle acceptance remain open.
- [x] Task-specific due dates and priorities implemented with additive runtime migrations, lead-only audited partial schedule edits, web creation/editor and shared Today display. Fresh-schema and older-schema migration preservation, API permissions/validation/no-op audit, fifteen backend helper tests, fourteen desktop/mobile browser checks, nine mobile tests/type check/export, web builds and Worker dry-run passed in credential-free Boat. Task reassignment, boards, blockers, comments/history UI and native schedule editing remain open.
- [x] Combined task owner/date/priority edits added with captured previous-value snapshots, stale/concurrent conflict protection, active/project owner eligibility at creation and reassignment writes, and transactional before/after audit. Web editor supports reassignment/unassignment and conflict reload; delayed task responses after account/project changes are suppressed. Local API old/new owner permission and concurrent edits, eighteen desktop/mobile browser checks, Turbo/frontend builds and Worker dry-run passed in credential-free Boat. Native lead editing, blockers, boards and collaboration remain open.
- [x] Scoped task timeline API and web history added with current project/task checks, selected before/after fields, private actor projection, stable same-second append ordering and cursor pages. Twenty-two desktop/mobile browser checks passed, including older-page loading and non-JSON access-denial clearing. Creation and bulk completion now write task history transactionally; local API retry/timestamp/permission checks, sixteen backend helper tests, web builds and Worker dry-run passed. Native history and broader collaboration remain open.
- [ ] Complete hosted database measurements and Android device spike/release gates.

Backend `tsc --noEmit` was exercised and confirmed to fail with compiler help because no tsconfig exists. Wrangler bundling passed; a usable backend type-check remains required.

Next increment: verify Today browser journeys, add task scheduling/priority and contextual attachment ownership, and advance database/mobile decisions. Continue database/mobile spikes alongside these foundations.

Verification environment: credential-free Boat sandbox `bx_n4hnqzn7`, resumed with a 30-minute TTL for this increment. Only synthetic local D1 was used; no production data or mail was touched.
