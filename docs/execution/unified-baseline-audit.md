# Unified platform baseline audit

Source inspection: 8 October 2026, `reimagined` based on `650048b`. This is an initial source audit, not certification of the club's live deployment.

## Trust and resource matrix

| Resource/action | Current source enforcement | Required evolution |
| --- | --- | --- |
| Member API | Legacy registry tokens or hashed device sessions; expiry/revocation, current parent credential and role lookup; maintenance restriction | Browser/provider acceptance, broader lifecycle coverage and Android integration |
| Google identity | Verified Clerk subject/session/origin; explicit dual-proof link, conflict rejection; active registry required | Live personal provider/browser acceptance; audit imported historical links |
| Rate limiting | Atomic D1 upsert per IP/endpoint; restart/concurrent endpoint checks passed | Monitor added D1 write traffic; define inactive-row retention before public release |
| Browser origin | Legacy origins and optional exact `ALLOWED_WEB_ORIGINS`, shared CORS/CSRF policy | Verify personal origins against local Worker and preview |
| Project list | Board, assigned department or explicit project role; same predicate for dashboard active counts | Guest identities will use separate scoped APIs; broader lifecycle tests still needed |
| Project task history | Current project read policy enforced; missing/inaccessible resource returns 404 | Extend boundaries to contextual attachments and mobile |
| Task mutations | Board, project-department director, or own assignee with current project access; transactional status audit | Richer ownership/due-date/history flows and browser verification remain |
| Instance management | Board or director of an assigned department | Verify each nested route, advisory deep links, and removal |
| Instance listing/activity | Explicit advisory exclusion exists | Keep exclusion across web/mobile and every nested route |
| Club-file download | Member power threshold; exact flat-key ID lookup limited to approved shared categories; private namespaces excluded | Explicit metadata/owner policy for contextual attachments; browser/guest negative coverage |
| Newsletter editor | Separate OTP sessions; separate newsletter D1 | Campaign idempotency, expiry/revocation, consent and provider-state tests |
| Letter Studio | Separate OTP auth; R2 upload/send routes; browser PDF generation and local history | Durable draft/issue records, numbering policy, template and visual acceptance |

Inspect `apps/admin-api/index.ts`: auth middleware, `canManageProjectTasks`, project/task routes, `canManageInstanceTeams`, team-instance routes and club-file download handler. Claims about individual handlers must be backed by endpoint tests before release.

## Verified portability increment

- Pages runtime `API_ORIGIN` changes forwarding and CSP without changing the legacy default.
- Backend runtime `ALLOWED_WEB_ORIGINS` adds exact HTTPS origins to CORS/CSRF without granting resource access.
- `wrangler.personal.example.toml` provides a separate personal resource checklist, with no club domain route and email cron disabled until sender verification.
- Six local Node tests passed: proxy forwarding/security/configuration and origin policy.
- In a credential-free Boat VM, dependency install, `pnpm turbo run build`, frontend TypeScript/Vite build and final Worker Wrangler dry-run succeeded. Frontend reports an existing large-chunk warning.
- Local Hono checks passed for fresh D1 initialisation, missing/invalid/revoked/expired tokens, valid member/director/board/advisory directory requests, board-only roles and advisory instance exclusion.
- Real endpoint testing caught the existing CSRF layer permitting unrelated-origin JSON writes to reach handlers. An explicit unsafe-method origin guard now rejects these; allowed-origin preflight and writes still pass.
- Backend `tsc --noEmit` fails because no backend tsconfig exists; bundling is not a replacement for this pending type-check work.

## Risks driving the next work

1. Project reads and legacy Club Files boundaries now have negative endpoint tests. Contextual attachment ownership and other nested resource reads still need coverage before introducing guest identities into shared middleware.
2. Production-capable member sessions and proof-backed explicit Google links have synthetic endpoint coverage. Client email no longer auto-links members; inactive registry access cannot be recreated through Google login. Live provider/browser journeys and historical-link review remain open.
3. D1 schema and migrations remain embedded in the API; newsletter tables in the main DB are legacy copies. Do not use the placeholder SQL for bootstrap or PlanetScale migration.
4. Hardcoded public/email links, sender defaults and OAuth domains remain beyond the proxy increment. Inventory them before declaring personal deployment portable.
5. Persistent rate limits are verified against local D1, including restart and concurrency. Public-read requests now add D1 writes; capacity and inactive-row retention still need operational review.
6. Google login retains the legacy response credential before frontend session exchange. Consolidating direct device-session issuance will reduce source-token exposure; preserve older clients through an additive rollout.
7. No Android app, contextual chat or guest subsystem is implemented yet. Builds of the existing website do not establish those outcomes.

## Next evidence

Run a local Worker with synthetic data: empty DB bootstrap and repeated start; permitted versus forbidden origins; missing/invalid/revoked/expired tokens; advisory and cross-department negative paths. Add resource fixtures and tests before session and project policy changes. Use isolated personal staging for real account validation later.
