# Portal GitHub integration: coverage

Audit date: 2026-11-05. Branch `feat/portal-github-integration`. Sources: the brief (`.omo/briefs/github-integration.md`), the contract (`.omo/waves/gh-core/design.md`) and the four lane reports (`app-auth`, `webhook`, `api`, `ui`; all four reports exist, no lane failed).

This is a coverage report, not a reduced scope definition. Paths are relative to `apps/portal/` unless stated otherwise.

**Read this first: what "done" means here.** Pure logic (signature check, JWT and client, token crypto, dispatch table, apply rules, board rules, write rules, attribution, backfill planning, UI view logic) has unit tests with fixtures and an injected `fetch`. The D1 layer (`apply.ts`, `handlers.ts`, `ledger.ts`, `notices.ts`, `sync/reads.ts`, `writes.ts`, `accounts.ts`, `backfill.ts`, `installations.ts`, `retention.ts`) and the routes were **typechecked and code-reviewed but not executed against a fake GitHub**: the planned fake-GitHub e2e suite (`tests/e2e/github-server.mjs`, `github-api.test.mjs`, `github-webhook.test.mjs`) was not written by any lane. Integration added one smoke e2e (`tests/e2e/github-smoke.test.mjs`, 6 tests): migration and seeded grants, permission gating, unconfigured-App behaviour, webhook signature rejection and delivery idempotency, the cron. The UI was driven in Brave Origin (desktop only) against mocked `/api/github/*` responses, not against the real routes. "Done" below therefore means implemented and typechecked, with the evidence stated in the row; no row has been exercised against live GitHub.

Legend: **done** = implemented, with the stated evidence; **partial** = implemented in part; **gap** = not implemented.

## Brief items

| Brief item | Status | Evidence / reason |
|---|---|---|
| GitHub link per person (verified mapping) | done | OAuth link (`routes/api/github/link/*`, `sync/accounts.ts`, PKCE, single-use hashed state) and admin link by login (`PUT /api/github/accounts/:personId`) store GitHub's numeric user id in `github_accounts`; `people.github_url` only suggests (D5). Rules in `accounts-rules.test.ts`, `user-auth.test.ts`. Not run against GitHub OAuth. |
| Repo connection per project (GitHub App) | done | `sync/installations.ts` lists the installation's repositories; admins map repository to project (`PUT /api/github/repositories/:id/project`). Unit: `app.test.ts`, `client.test.ts`. Not run against GitHub. |
| Two-way issue sync: issues created, assigned, labelled or closed in GitHub appear on the dashboard and board | partial | Webhook handlers for `issues`, `issue_comment`, `label`, `milestone`, `pull_request`, `pull_request_review`, `check_run`, `status`, `repository` and installation events (`webhook/handlers.ts`, rules in `apply-rules.test.ts`), plus the `*/10` backfill and resync (`crons/github-sync.ts`). The apply SQL (out-of-order guards, replace-in-batch) has never run against D1 with a payload. Deletions and transfers are seen only through webhooks (gap 3 below). |
| Assign in GitHub reflects on the dashboard | partial | Assignees are mapped to portal people through `github_accounts` and shown on cards, My work and the board; unlinked assignees show as GitHub logins. Same runtime caveat as the row above. |
| Create / assign / close from the portal writes to GitHub | partial | `sync/writes.ts` and routes `projects/:id/issues` (create), `issues/:id` (edit), `column`, `assignees`, `labels`, `state`, `comments`; idempotent through `requestId` (`github_write_requests`), version check, audit entries. User-token write with App fallback (D3, `attribution-rules.test.ts`). Never run against a fake or real GitHub. |
| Webhook endpoint: signature verification, idempotent upserts | done | `routes/api/github/webhook.ts`: HMAC check, ledger by `X-GitHub-Delivery`, 401/400/413/503 paths. E2E smoke proves bad signature 401, a signed ping is `ignored`, a replay is `duplicate`, the ledger row exists. Event handling after the gate is unit-tested only. |
| Backfill / resync job | partial | `sync/backfill.ts` and the `*/10 * * * *` cron with a 30-call budget and per-repository cursors; planning in `backfill-rules.test.ts`. The e2e smoke runs the cron with no App configured (prune only). The sync steps themselves are unexecuted. |
| Kanban board per project | done | Columns come from `status:` labels, open/closed and linked pull requests (D1/section 10, `board-rules.test.ts`); `GET /api/github/projects/:id/board`; `GitHubBoard.tsx` with filters, optimistic move and rollback. UI driven in Brave Origin with mocked API. |
| Sprints / milestones, due dates | partial | Milestones list with progress (`MilestoneList`); due dates are portal-only with a milestone `due_on` fallback (D8). No sprints, and no burndown or velocity chart (gap 6 below). |
| "My work" dashboard | done | `GET /api/github/my-work`, `MyWorkPage.tsx` (`/my-work`): Overdue, Assigned to me, Waiting for my review, My pull requests; an unlinked person is pointed to the profile card. Reads are covered by the smoke e2e only for the empty case. |
| PR <-> issue linking | partial | Closing keywords in PR bodies produce `github_issue_links` (`apply-rules.test.ts`, code spans and fences excluded). Sidebar "Development" links (GraphQL) are not read (gap 4). |
| CI status on cards | partial | `check_run` and `status` events and the pull-request backfill fill `github_commit_checks` and a per-pull aggregate shown on cards and `PullList.tsx`. Incremental re-fetch only covers pulls whose status is `none` or `pending`. Unexecuted against D1. |
| Activity feed | done | `github_activity` rows from webhook applies; `GET /api/github/projects/:id/activity`; `ActivityFeed.tsx`. |
| Burndown / velocity per milestone | gap | Not built. `MilestoneProgress` has counts, percent, due date and recently closed only. No estimates or story points. |
| In-app notifications | partial | `github_notifications` for assigned, review requested, review submitted, mentioned (webhook-written, deduplicated, never to the sender). Own card on the Notifications page and a new `github` preference category; the badge count includes visible unread GitHub notices (`unreadCount`). The notices page is a separate card, not interleaved with other notices. Email digest is stored as a preference only and **never sent** (the brief: opt-in only, no auto-send). |
| Offboarding | done | `sync/offboarding.ts` registers a `github` step and is now imported by `routes/api/people/[id]/offboard.ts`. Not exercised by a test. |

## Contract items (design.md)

| Item | Status | Reason |
|---|---|---|
| Section 3: 7 optional env keys, `parseGitHubSettings`, missing-key behaviour (503 `github_not_configured`, `linking_not_configured`, App-attributed fallback) | done | `env.ts`, `config.ts` (`config.test.ts`). Smoke e2e: status reports `app:false, webhook:true`, installations sync answers 503. Deviations: a bad token key keeps `app` configured and only stops token storage; webhook-secret length is not enforced. |
| Section 4: permissions `github.manage`, `github.issues.write`; seed grants; `canWriteIssues`, `visibleRepositoryScope` | done | Keys added to `src/server/permissions.ts` by integration; grants appended to the migration (admin both global; director and member `github.issues.write` per department; advisory none). E2E proves the seeded rows and 401/403 on the admin routes. `access.test.ts` covers the client mirror. |
| Section 5: 16 tables | done | `db/schema/github.ts`; migration `20261105035337_keen_wallow.sql`: 16 `CREATE TABLE`, 4 unique and 19 plain indexes, then the grants. Additive only. Applied by every e2e start. |
| Section 6: App JWT, installation token cache, client, token crypto, OAuth helpers | done | 52 unit tests, injected `fetch`, no network. `userTokenFor` / `storeUserTokens` (D1) untested. |
| Section 7: accounts, linking, offboarding step | partial | Implemented; OAuth callback never exercised end to end. |
| Section 8: webhook route, ledger, dispatch, handlers | partial | See the webhook row above. `applyCheckRun` / `applyCommitStatus` return `boolean` (design said `void`). |
| Section 9: writes, idempotency, attribution | partial | Unexecuted. A write that reaches GitHub but whose result is lost is surfaced as "outcome unknown" in the UI, not reconciled. |
| Section 10: board columns and labels | done | Pure rules unit-tested. |
| Section 11: installations sync, backfill, retention | partial | Implemented, unexecuted. A new mapping imports open items plus items updated in the last 90 days (gap 11). |
| Section 12: 30 handlers in 27 route files | done | All present. UI call paths and methods were compared with the route files at integration: every `github-client.ts` call matches an exported method. `github-client.ts` still calls `api` through one cast, so a path/method drift would not be a compile error. |
| Section 13: notifications, `github` category, `unreadCount` | done | Integrated here (category appended, count adds visible unread notices). Smoke e2e checks the count endpoint still answers 0. |
| Section 14: UI | partial | Board, issue page, My work, admin page (four sections), profile card, notices, project section. Not done: drag and drop (select-based "Move to" instead), burndown, phone widths (the user checks), and `styles.css` (styles live in `components/github/*.css`, imported by their components). `IssueCard.repository` has no `removed`/`archived` flag, so the UI joins against the project's repository list. |
| Section 15: tests | partial | Unit: all pure modules. E2E: smoke only (6 tests). Missing: fake GitHub server, `github-api` and `github-webhook` e2e suites. |
| Section 16: docs | partial | This file, `apps/portal/README.md` setup section. Not written (outside the integration scope): `docs/contracts/api-contract.md`, `data-model.md`, `business-logic.md`, `invariants.md`, `docs/operations/deployment.md`, `system-architecture.md`, ADR 012 and its index entry. |

## Decisions D1-D11

| Decision | Status |
|---|---|
| D1 columns from labels | done (Projects v2 is gap 1) |
| D2 inline webhook processing with ledger | done |
| D3 user token with App fallback | done in code, unexercised |
| D4 AES-GCM user tokens under `GITHUB_TOKEN_ENCRYPTION_KEY` | done (unit tests); storage layer untested |
| D5 identity by numeric id | done |
| D6 issue key `<repository id>-<number>` | done |
| D7 one project per repository; data only for mapped repositories | done |
| D8 portal-only due dates | done |
| D9 budgeted `*/10` cron | done in code, unexecuted |
| D10 PKCE, hashed, single-use state | done |
| D11 pull requests read-only except comments | done (gap 2) |

## Gaps (also for the PR body)

1. Projects v2 fields are neither read nor written (D1).
2. Pull-request writes: merge, reviews, reviewer requests (D11).
3. Issue deletions and transfers are seen only through webhooks; a resync cannot detect one it missed.
4. Closing references come only from keywords in the PR body, not GitHub's sidebar "Development" links.
5. No email for GitHub notices; the digest preference is stored only.
6. Velocity and burndown are not built; no estimates or story points; no sprints.
7. App-mode edits show the App as the actor on GitHub; the portal audit log records the person.
8. Comments are not stored; the issue detail needs GitHub reachable to show them.
9. Requested team reviewers are not shown (users only).
10. Other organisations and GitHub Enterprise Server are unsupported.
11. A new mapping imports open items plus items updated in the last 90 days.
12. **No runtime coverage of the D1 layer against GitHub fixtures** (fake GitHub server and webhook/api e2e suites). The first real exercise will be the first real delivery or sync.
13. UI: no drag and drop, no burndown, phone widths unchecked, API contract types are a cast in `github-client.ts`.
14. Docs: the files listed under Section 16 above were not updated.
15. `GhCommitStatus` is defined locally in `backfill.ts`, not in `types.ts`; `private_key_invalid` is only reported by the status route when it tries the key.

## Secrets (names only; set with `void secret put <NAME>`, locally in the gitignored `apps/portal/.env`)

| Name | Purpose |
|---|---|
| `GITHUB_APP_ID` | GitHub App id (digits) |
| `GITHUB_APP_PRIVATE_KEY` | App private key, **PKCS#8** PEM; real newlines or `\n` escapes |
| `GITHUB_WEBHOOK_SECRET` | HMAC secret for `POST /api/github/webhook` (use at least 32 random characters) |
| `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET` | optional; OAuth account linking |
| `GITHUB_TOKEN_ENCRYPTION_KEY` | optional; base64 of 32 random bytes (`openssl rand -base64 32`); without it writes are App-attributed |
| `GITHUB_TEST_API_URL` | local tests only; ignored in production |

All are optional so the portal deploys with the integration switched off.

## GitHub App setup

1. Create a GitHub App owned by `180DC-VIT-CHENNAI`, installable "Only on this account"; homepage `https://180dc.vitcc.org`.
2. Callback URL `https://180dc.vitcc.org/api/github/link/callback` (add `http://localhost:<port>/api/github/link/callback` for local work). Leave "Request user authorization during installation" and Device flow off; "Expire user authorization tokens" on.
3. Webhook: active, URL `https://180dc.vitcc.org/api/github/webhook`, secret = `GITHUB_WEBHOOK_SECRET`, SSL verification on.
4. Repository permissions: Metadata read, Issues read and write, Pull requests read, Checks read, Commit statuses read. No organization or account permissions.
5. Subscribe to events: Issues, Issue comment, Label, Milestone, Pull request, Pull request review, Check run, Status, Repository.
6. Install on `180DC-VIT-CHENNAI` with **All repositories**.
7. Generate a private key and convert it: `openssl pkcs8 -topk8 -nocrypt -in <download>.pem -out app-pkcs8.pem`; store the result as `GITHUB_APP_PRIVATE_KEY`.
8. Set the secrets above, deploy, open `/admin/github`, run "Sync installations", then map each repository to a project. Members link their GitHub account from their own profile.
