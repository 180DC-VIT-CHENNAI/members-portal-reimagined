# A4 / ORG-01 requirement coverage

Audit date: 2026-10-21. Assigned specification: sections 5 and 13.E of
`180DC_Unified_Platform_Engineering_Spec.md`.

This is a coverage report, not a reduced scope definition. The PR implements
the lifecycle core described below, but **does not complete every assigned
specification requirement**. Passing the existing suites does not cover the
missing workflows. No placeholder or stored-only field is counted as completion.

Paths below are relative to `apps/portal/` unless stated otherwise.

## Section 5.1: every required-feature bullet

| Requirement | Implementation and test evidence | Coverage / uncovered work |
|---|---|---|
| Invite, activate, suspend/on-leave, restore, remove, alumni; actor/reason/effective dates | `src/server/lifecycle.ts`, `signin.ts`, `status-history.ts`; `routes/api/people/[id]/status.ts`, people create/import and term-start handlers. `tests/e2e/personnel.test.mjs` exercises invitation, activation, reinstatement, on-leave, invalid transitions and department scoping; `member-lifecycle.test.mjs` checks actor/reason/date and rejects future dates. | Covered except legacy history, which is not backfilled. `on_leave` keeps access. `suspended` (reason required) denies sign-in and deletes sessions until restored to `active`/`on_leave`; covered by `lifecycle.test.ts` and the suspension case in `member-lifecycle.test.mjs`. |
| Configurable primary department, secondary memberships, project staffing | People update handler; `src/server/memberships.ts`, `routes/api/people/[id]/memberships/`; existing project membership APIs. `member-lifecycle.test.mjs`: finance secondary membership appears in directory without changing permissions; cross-department and primary-as-secondary writes rejected. `projects.test.mjs` checks project membership access and task assignment. | Implemented for primary/secondary departments and existing project staffing. Secondary memberships grant no permissions. |
| Promotion proposal, approval, tenure, official letter, separate access review, notice/audit | `routes/api/promotions/`, `src/server/promotion-rules.ts`; approval batches decision, tenure, access review, captured email campaign and audit. `member-lifecycle.test.mjs` checks proposer/target cannot approve, other department gets 404, second director approval, unchanged roles/grants/permissions, review closure and captured notice. `promotion-rules.test.ts` covers the decision rules. | Partial. Optional `letterDocumentId` is an access-checked link, not a letter issuance workflow. Existing Letter Studio has independent issuance/send tests in `letters.test.mjs`, but no promotion-to-issued-letter integration test or enforced sequence exists. |
| Position history, reports-to graph, org chart by term, term-bound team assignments | `src/server/tenures.ts`, `org-chart.ts`; `routes/api/tenures/[id]/index.ts`, `org-chart.ts`; person tenure card and `OrgChartPage.tsx`. `member-lifecycle.test.mjs` checks reporting updates, cycle refusal, department denial and chart; `org-chart.test.ts` covers graph rules. Existing `team-instances.test.mjs` checks team placement/access/capacity. | Partial. Tenures and chart are term-bound; existing team-instance staffing is not term-bound. |
| Onboarding policy acknowledgments, introductory tasks, authorized mailbox assignments | `src/server/onboarding.ts`, `onboarding-data.ts`, policy/acknowledgment handlers and `OnboardingPoliciesPage.tsx`. `onboarding.test.mjs` checks derived profile and persisted acknowledgments, visibility and invalid inputs; `member-lifecycle.test.mjs` checks policy creation/acknowledgment. | Partial. No introductory-task assignment workflow or mailbox-assignment stage is connected to onboarding. Existing mailbox grants are separate. No individual mailbox provisioning was introduced. |
| Offboarding: session/device revocation, mailbox removal, pending-send checks, project ownership, client threads, document access cleanup | `src/server/offboarding.ts`, `mailboxes/offboarding.ts`, `crm/offboarding.ts`, person offboard route/UI. One batch removes Better Auth sessions/personal grants/mailbox capability rows, ends tenures, reassigns tasks/project roles/CRM owners and owner grants, removes CRM collaborators and records handover/audit. `member-lifecycle.test.mjs` checks successor requirement, reassignment, completed-task preservation, grant/session cleanup, CRM audit and idempotence. `mailboxes.test.mjs` checks offboarding/reinstatement denial and approver-revocation dispatch blocking. | Partial. Better Auth sessions are revoked, but a separate native-device credential contract is not implemented/tested here. Mailbox conversation assignments and outstanding reviews are not transferred. CRM ownership transfer is not client-thread transfer. Personal-grant cleanup and live status checks block document access, but there is no independent document ownership/private-share inventory or transfer test. |
| Member goals, participation, feedback/recognition, skills directory, optional mentorship; sensitive data private, no automated rankings | Existing editable profile skills are exercised by `personnel.test.mjs`. | Uncovered except for profile skills storage. No goals, participation, feedback/recognition, searchable skills directory or mentorship workflow/tests. No automated rankings or performance records were introduced. |
| Recruitment: applications, screenings, reviewers, interviews, decisions, issued/signed letters, onboarding conversion | No implementation or tests in this PR. | Uncovered. Legacy recruitment was previously removed; this PR does not recreate it. |
| Annual board transition: verified authority handover, continuity, succession history, emergency access, archives | `routes/api/terms/[id]/handover.ts`, `routes/api/handover-items/[id].ts`, `HandoverPage.tsx`, admin term card; tenure history. `member-lifecycle.test.mjs` checks manager creation, owner-only visibility/completion, other-owner 404 and denied edits. | Partial. A real owner-scoped continuity checklist exists; checking an item is not verified authority transfer. No emergency-access recovery workflow, dedicated historical archive or verified succession workflow is implemented. |

## Section 5.2: administrative separation

| Requirement | Evidence | Coverage |
|---|---|---|
| Role access controls software operations | `src/server/permissions.ts`, guard/principal loading; scoped negative tests in `personnel.test.mjs` and `member-lifecycle.test.mjs`. | Implemented. Secondary memberships do not enter permission calculation. |
| Position is a term title, not software access | Promotion approval writes no role/grant rows. E2E compares roles, personal grants and effective permissions before/after approval. | Implemented. |
| Mailbox capability is a separate per-mailbox grant | Existing mailbox ACL and dispatch checks, `mailboxes.test.mjs`; new offboarding capability removal and audit test. | Implemented for the current mailbox capability model. |
| Project/client access is engagement-object scoped | Existing project and CRM record ACLs (`projects.test.mjs`, `crm.test.mjs`). CRM offboarding moves owners/owner grants and deletes the leaver's collaborators without expanding their software role. | Implemented for current project/CRM objects; missing private-client/thread workflows above are not implied. |
| Server-side non-self-escalation, audit, optional second approval; equivalent paths | Existing access endpoint prohibition retained. `member-lifecycle.test.mjs` checks own role/grant writes, unauthorized director writes and proposer/target approval refusal. Mailbox self-grant checks remain in `mailboxes.test.mjs`. | Covered for these routes, not a claim of a repository-wide security audit. |

## Section 13.E: every acceptance step

| Step | Evidence | Result |
|---|---|---|
| 1. Director proposes; authorized approver signs off | Promotion E2E negative/positive cases and Brave screenshots `promotion-pending-proposer-desktop.png`, `promotion-approved-desktop.png`. | Pass for the implemented approval flow. |
| 2. Tenure history updates without implicit admin expansion | E2E unchanged access comparison, created tenure assertion; approved person page shows Director with access role member. | Pass. |
| 3. Letter Studio issues the record; permitted recipients receive correctly categorized notification | Promotion E2E captures the promotion email to the person only; existing Letter Studio tests cover independent PDF/send behavior. | Partial: notification tested; integrated issuance and its acceptance scenario are missing. Linking a document ID is insufficient. |
| 4. Later offboarding transfers project ownership, mailbox assignments and outstanding reviews; revokes devices | E2E project/CRM reassignment, mailbox capability deletion, Better Auth session deletion and 401; Brave preview/summary/person history. | Partial: mailbox grants are removed, not assignments transferred; outstanding-review transfer and native-device revocation are not implemented. |
| 5. No permission retained solely because of historical title | E2E promotion leaves access unchanged; offboarding ends tenure/removes grants/revokes session; reinstatement does not restore mailbox capabilities. | Pass for tested portal roles/grants/sessions. Native-device acceptance remains unverified. |

## Verification and remaining gates

After rebasing onto `90c7ee5` (internal messaging #47), the single additive
migration is `20261021130459_first_dark_phoenix.sql` with snapshot and journal.
Its SQL matches the previous lifecycle migration; it follows the CRM and
messaging migrations and preserves the new Conversation button on person pages.

- Typecheck: exit 0.
- Unit: 128 passed, 0 failed.
- Portal build and root turbo build: exit 0.
- Full portal e2e: 266 passed, 0 failed (including 20 member-lifecycle tests).
- Root legacy regression suite: 221 passed, 0 failed.
- The previously failing meet-follow-through and newsletter-subscriptions files
  each pass alone after rebase. The earlier failures did not recur in either
  full run; they are non-reproduced intermittent failures, not proven fixed bugs.
- Desktop Brave Origin QA repeated on isolated port 9573 after a reported
  collision on 9347: promotion, offboarding preview and summary, refreshed status
  history, org chart and owner-scoped handover all pass; no console errors or
  horizontal overflow on the inspected page.
- Evidence: `.omo/evidence/org-a4/` in the main checkout (screenshots, action
  log, fixture/driver and verification logs). No production data or live email.
- Phone checks remain with the user. This QA does not claim light/dark,
  keyboard-only, native-device, recruitment or other missing workflow coverage.

The uncovered requirements above remain assigned scope, not approved deferrals.
This PR should not be reported as full ORG-01 / section 13.E completion.
