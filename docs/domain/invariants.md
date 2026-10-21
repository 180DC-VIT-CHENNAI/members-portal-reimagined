# Invariants — 180DC VIT Chennai Platform

## Member lifecycle invariants

- **ORG-PERM-01:** Department-scoped permissions follow the primary `people.department_id` only; secondary memberships grant nothing.
- **ORG-PROMO-01:** A promotion approver differs from both the proposer and the person concerned, and approval never changes access roles or personal grants (it opens an access review instead).
- **ORG-ACCESS-01:** Nobody changes their own access role or grants through `PUT /api/people/:id/access`.
- **ORG-OFF-01:** Offboarding is one batch (status, history, every registered cleanup step, handover record, audit) and re-running it changes nothing. It revokes sessions, ends tenures, removes personal grants, shared-mailbox capability rows and CRM record grants, and hands open tasks, project roles and CRM ownership to an active successor.

Covered by `apps/portal/tests/e2e/member-lifecycle.test.mjs`, `src/server/promotion-rules.test.ts` and `src/server/org-chart.test.ts`.

## CRM invariants

- **CRM-ACL-01:** Every CRM list, search, count, detail and mutation applies the caller's live owner/grant/admin visibility; hidden records are 404 and never confirmed by duplicate checks.
- **CRM-PRIV-01:** Contact email, phone, consent and notes are returned only with organisation- or contact-level access.
- **CRM-FLOW-01:** One opportunity per consulting request and one engagement per opportunity; won only through proposal acceptance; decided proposals and frozen versions never change.
- **CRM-CASE-01:** Closeout never writes public `case_studies`; a draft needs explicit case-study consent.

Covered by `apps/portal/tests/e2e/crm.test.mjs` and `src/server/crm/rules.test.ts`.

## Shared mailbox invariants

- **MAIL-ACL-01:** Every mailbox read, draft, attachment, send status and audit request checks the exact mailbox's current grants; administrators/managers do not implicitly receive body access, and self-grants are forbidden.
- **MAIL-REVIEW-01:** Approval binds a frozen revision/digest and mailbox-policy version, with current approve/send rights. Changing any reviewed field invalidates approval and cancels unsent intents.
- **MAIL-DISPATCH-01:** Only one atomic claim may start an intent. Revoked/deactivated actors, retired mailboxes, stale approval, changed attachment bytes and pause switches prevent dispatch.
- **MAIL-OUTCOME-01:** Accepted is never called delivered. Unknown, partially accepted or interrupted sends are never automatically replayed.
- **MAIL-IDENTITY-01:** From and Reply-To come from the server's mailbox record. Drafting capability never confers global email permission. Cloudflare business transport only permits existing correspondence replies; new live mailboxes remain disabled.

Covered by `apps/portal/tests/e2e/mailboxes.test.mjs` and `src/server/mailboxes/rules.test.ts`.

## Internal messaging invariants

- **CHAT-ACL-01:** Every conversation list, unread count, search, mention notice, detail and mutation evaluates current access. Direct conversations need a participant row; department channels need home department or `departments.workspace.view`; project channels need `visibleProjects`. A caller who cannot read a conversation gets 404 and never sees it counted.
- **CHAT-DM-01:** A new direct conversation needs two distinct current active/on-leave members. When one leaves, the other can read the history but cannot send; the leaver has no session.
- **CHAT-EDIT-01:** Only the author edits, only within 15 minutes, and never after deletion. A tombstone erases the body and removes its reactions, search hit and mention notices.
- **CHAT-NOTICE-01:** A mention notice is created at most once per recipient and message, only for someone who can read the conversation at that moment, has not muted it and has not turned off mention notices. No message email is sent.
- **CHAT-QUIET-01:** Per-category quiet hours use India time and a start-inclusive, end-exclusive interval, including overnight windows. Quiet or disabled categories do not contribute to the notification badge. Quiet hours never delete inbox entries or mark them read; ending the interval restores still-authorized unread notices.

Covered by `apps/portal/tests/e2e/messaging.test.mjs` and `src/server/messaging-rules.test.ts`.

## Portal collaboration invariants

- **PORTAL-INVITE-01:** A rejected invitation creates no person, tenure, campaign or audit. A successful invitation commits all applicable records together.
- **PORTAL-INBOX-01:** Assignment/comment notices commit with the mutation and deduplicate across retries. Only a notice's recipient marks it read; revoked project access removes all labels and counts before result limits.
- **PORTAL-INTERNAL-01:** An internal project never appears publicly, even when completed. A department-workspace grant cannot make it publishable or reshape joint work without covering every department.
- **PORTAL-INTERNAL-02:** Consolidating old department work does not widen its audience to every department member. Internal work requires workspace-read/management authority or explicit project membership; Today, files, meeting action items and inbox follow the same current policy.
- **PORTAL-BLOCKED-01:** Blocking requires a nonblank reason, completion/unblocking clears it, and optimistic versions still reject stale changes.
- **PORTAL-ACTION-01:** Meeting action-item links confer no project permissions; inaccessible task/project identifiers and labels are omitted.
- **PORTAL-FILE-01:** Contextual file reads inherit current project access; every file/task must match its URL scope. Neither contextual files nor letter PDFs are reachable through shared-file APIs.
- **PORTAL-FILE-02:** Concurrent uploads cannot exceed 100 files per scope. Metadata deletion atomically queues primary R2-byte cleanup; failed cleanup leaves the deletion intent for retry.

## Void portal letter studio invariants

- **PORTAL-LETTERS-01:** Read/save/send authority uses current personnel grants and an explicit saved department, never a free-text team, position, document title or old OTP credential. Letter files cannot be read through public/shared-file routes.
- **PORTAL-LETTERS-02:** Saved PDF bytes and metadata are immutable; one actor/request UUID creates at most one send intent and campaign transactionally. Sending derives attachment and content from that saved document.
- **PORTAL-LETTERS-03:** A queued message is never labeled accepted before the provider result. Unknown results are distinct and not automatically resent. Required missing PDFs stop delivery, and raw attachments cannot exceed the 3 MiB email budget.

Covered by `apps/portal/tests/e2e/letters.test.mjs`; browser/PDF QA also verifies every template's fixed A4 geometry and refusal of content that cannot fit safely.

## Void portal newsletter invariants

- **PORTAL-NEWS-01:** A pending/unsubscribed/missing subscriber never receives a real newsletter or event broadcast. Audience state is rechecked before each send; each message carries only that recipient's unsubscribe capability.
- **PORTAL-NEWS-02:** Only one concurrent confirmation claims a live hash, and only one broadcast claims an unsent issue. No self-test or zero-acceptance broadcast publishes an issue; public detail never exposes drafts.
- **PORTAL-NEWS-03:** Editing, testing and sending all enforce current Google permissions and issue ownership/shared status. A test cannot become a broadcast or select an arbitrary target. Erasing a subscriber and its audit are transactional.

Covered by `apps/portal/tests/e2e/newsletter-subscriptions.test.mjs` and `newsletter-issues.test.mjs`.

Invariants are properties that must never become false while the system is running.

## Void portal email invariants

- **PORTAL-EMAIL-01:** Each send attempt reserves a shared hourly slot atomically in D1. Direct mail cannot reserve above the configured limit (500 by default), and campaigns cannot reserve above 90% of it. Failed sends release the slot, except `OUTCOME_UNKNOWN` results, which Cloudflare may have accepted; a crash may leave conservative usage until the hour changes. Enforced by `apps/portal/src/server/email/send.ts`; concurrent last-slot behavior is covered in `tests/e2e/email.test.mjs`.
- **PORTAL-EMAIL-02:** Campaign inspection and retries require global `email.view` and `email.manage` respectively. A department-scoped grant cannot reveal global campaigns. Arbitrary sends with department-scoped `email.send` reach only active/on-leave people in those departments. API tests cover both boundaries.
- **PORTAL-EMAIL-03:** Production builds never capture messages through test mode and never include the `.dev.ts` outbox/drain routes. Capture tests never call `sendEmail`.
- **PORTAL-EMAIL-04:** Recorded acceptance by Cloudflare settles a recipient across retries; it is not proof of inbox delivery or exactly-once delivery. Acceptance and D1 persistence are separate operations.
- **PORTAL-EMAIL-05:** The `SEND_EMAIL` binding allows only `noreply@180dc.vitcc.org` (`allowed_sender_addresses` in `apps/portal/void.config.ts`), so no code path can send as another address on the domain.

## Void portal meets invariants

- **PORTAL-MEETS-01:** No portal read returns a meet link once the meet is more than 24 hours past (`julianday(scheduled_at) >= julianday('now', '-1 day')` keeps it), and re-announcements of such meets carry no link. Enforced in `apps/portal/src/server/meets.ts`; covered by `tests/e2e/meets.test.mjs`.
- **PORTAL-MEETS-02:** A meet announcement reaches only active and on-leave people: everyone except advisory members without a department for club-wide meets, otherwise exactly the people whose home department is one of the meet's departments.

## Void portal projects invariants

- **PORTAL-PROJECTS-01:** Being named on a project only grants seeing it. Managing a project always comes from a grant covering its departments: `projects.manage` must cover all of them; `projects.members.manage` and `projects.tasks.manage` any of them. Enforced in `apps/portal/src/server/project-rules.ts`; covered by `project-rules.test.ts` and `tests/e2e/projects.test.mjs`.
- **PORTAL-PROJECTS-02:** A task is only assigned to someone who can see its project, and every task edit or status change applies to the exact version it was based on (otherwise 409, nothing written).
- **PORTAL-PROJECTS-03:** Only completed non-internal projects are public, and only their id, name, client, description and completion time.

- **PORTAL-PROJECTS-04:** A comment request is unique per author/request UUID; only identical, undeleted retries replay. Removal erases its body. Creation/removal and their audit entry either both commit or neither does. Covered by failure-injected D1 trigger tests in `task-activity.test.mjs`.
- **PORTAL-PROJECTS-05:** Task comments/history require current project access and correct task parentage. History exposes only allow-listed values, never comment text, raw descriptions or raw audit details. Cursor ordering remains stable for entries with identical timestamps.
- **PORTAL-TODAY-01:** Today never returns an assigned task without current project visibility, or a completed task/project. Its inter-department meeting previews match the reader's department-view scope. Attention counts are omitted without the relevant permission.

## Void portal team instances invariants

- **PORTAL-TEAMS-01:** A department-scoped `team_instances.manage` grant runs an instance only when it covers one of its departments, and changes its settings, departments or ladder, or deletes it, only when it covers all of them. Enforced in `apps/portal/src/server/team-instance-rules.ts`; covered by `team-instance-rules.test.ts` and `tests/e2e/team-instances.test.mjs`.
- **PORTAL-TEAMS-02:** A team never holds more people than its maximum (members and outside people together) or anyone twice: placements and moves check the cap inside their insert, and a new cap is checked inside its update. A refused or failed move leaves the person on their original team. Covered by simultaneous-placement and D1-trigger failure tests in `tests/e2e/team-instances.test.mjs`.
- **PORTAL-TEAMS-03:** Outside people's emails reach only those who run the instance: other viewers get null emails, and the activity feed never contains emails.

## Auth invariants

### INV-AUTH-04: Explicit browser write origins are authorised

- **Statement:** On `reimagined`, unsafe-method requests carrying a non-local `Origin` outside the legacy and `ALLOWED_WEB_ORIGINS` lists receive 403 before database initialisation or route mutation, including JSON content types.
- **Where enforced:** Explicit origin guard before Hono CSRF middleware in `apps/admin-api/index.ts`.
- **Verification:** `scripts/verify-local-origins.mjs` against a local Worker configured with the personal test origin. Token/editor/resource permissions remain independent requirements.

### INV-AUTH-01: Authenticated requests require a valid, unrevoked, unexpired token

- **Statement:** Every request to a non-public `admin-api` endpoint must present a Bearer token that exists in `admin_tokens`, has `revoked_at IS NULL`, and has `expires_at` in the future or null.
- **Reimagined extension:** Bearer credentials may instead resolve to an unrevoked, unexpired `member_sessions` row whose current user and source registry token remain active. Its `source_token_hash` must match the current source token. Raw device credentials are not stored. Individual revocation is account-owner scoped; rank alone grants no visibility into another account's sessions.
- **Reason:** This is the only authorization boundary between the public internet and member data.
- **Where enforced:** `apps/admin-api/index.ts`, auth middleware starting at `app.use("*", ...)`.
- **How verified:** Inspect `admin_tokens` lookup; attempt a request without a token or with a revoked token and confirm 401.
- **Related business rules:** RULE-AUTH-01.
- **Current status:** ENFORCED.

### INV-AUTH-02: Maintenance mode blocks non-board members

- **Statement:** When `maintenance_mode.enabled = 1`, any authenticated member with `power_level < 100` must receive a 503 error on all authenticated endpoints.
- **Reason:** Board needs a way to take the members portal offline for other users.
- **Where enforced:** Auth middleware in `apps/admin-api/index.ts`.
- **How verified:** Enable maintenance mode and attempt a request with a non-board token.
- **Related business rules:** RULE-AUTH-05, RULE-MAINT-02.
- **Current status:** ENFORCED.

### INV-AUTH-03: Google login cannot bypass token auth

- **Statement:** Google sign-in only provides a session if the Worker-verified Google account (ID-token `sub`) is explicitly linked to exactly one OAuth-enabled member with active registry access. Caller email cannot prove identity, and Google sign-in cannot restore revoked or expired member access.
- **Reason:** Google OAuth is an alternative login method, not a separate auth boundary.
- **Where enforced:** `GET /api/auth/google/callback`.
- **How verified:** `tests/api/01-auth.test.mjs` (unlinked account → `not_linked`, revoked token → `inactive`).
- **Related business rules:** RULE-AUTH-02.
- **Current status:** ENFORCED.

## Role and permission invariants

### INV-ROLE-01: Sensitive operations require `power_level >= 100`

- **Statement:** Board-only endpoints (member creation/removal, role creation, global project creation, announcement creation, maintenance toggle, newsletter admin, consulting request management, admin tokens, advisory member creation) require `power_level >= 100`.
- **Reason:** These operations affect global club state and membership.
- **Where enforced:** Individual route handlers in `apps/admin-api/index.ts`.
- **How verified:** Attempt each operation with a director token; confirm 403.
- **Related business rules:** RULE-ROLE-03, RULE-MEMBER-01, RULE-PROJECT-01, RULE-ANN-01.
- **Current status:** ENFORCED.

### INV-ROLE-02: Directors can only act within their own department

- **Statement:** A director (`power_level = 50`) can only create department meets, documents, instructions, projects, and send emails for their assigned department.
- **Reason:** Department autonomy and data isolation.
- **Where enforced:** `canAccessDept` and `canManageInstanceTeams` helpers, plus inline checks in department and project routes.
- **How verified:** Attempt to create a meet for another department; confirm 403.
- **Related business rules:** RULE-DEPT-01, RULE-TEAM-04.
- **Current status:** ENFORCED.

### INV-ROLE-03: Board members cannot be removed

- **Statement:** `DELETE /api/members/:id` must reject if the target user's role has `power_level = 100`.
- **Reason:** Prevents accidental removal of club leadership.
- **Where enforced:** `DELETE /api/members/:id` handler.
- **How verified:** Attempt to delete a board member; confirm 400.
- **Related business rules:** RULE-ROLE-06.
- **Current status:** ENFORCED.

### INV-ROLE-04: Board roles cannot be transferred

- **Statement:** Role transfers where either party has `power_level = 100` must be rejected.
- **Reason:** Board roles are not transferable.
- **Where enforced:** `POST /api/role-transfers/:id/approve` and `POST /api/my-role-transfers/:id/accept`.
- **How verified:** Attempt to transfer a board role; confirm 400.
- **Related business rules:** Role transfer workflow.
- **Current status:** ENFORCED.

### INV-ROLE-05: New custom roles cannot reach board level

- **Statement:** `POST /api/roles` rejects `power_level >= 100`.
- **Reason:** Board-level power must be controlled by system-seeded board roles.
- **Where enforced:** `POST /api/roles`.
- **How verified:** Attempt to create a role with `power_level = 100`; confirm 400.
- **Related business rules:** RULE-ROLE-02.
- **Current status:** ENFORCED.

## Data integrity invariants

### INV-PROJECT-01: Lists, counts and task URLs share current project permissions

On `reimagined`, board access, assigned department and explicit project role are the member read grants. No department grants no additional visibility. Unrelated/missing project task reads return 404. `verify:local-projects` exercises all four roles and immediate explicit-role revocation.

### INV-TASK-01: Owned task updates are persisted and attributable

A task can be changed only by a project manager or its assignee with current project read access. The task must belong to the URL's project. Status/assignee changes detected between read and write return 409. An actual change and audit insert share a [D1 batch transaction](https://developers.cloudflare.com/d1/worker-api/d1-database/); retries of the same state do not rewrite completion time or add history. Verify changes and audit rows in isolated local D1.

### INV-DATA-01: User email is unique

- **Statement:** `users.email` has a `UNIQUE` constraint.
- **Reason:** Email is the primary identifier for login and notifications.
- **Where enforced:** D1 schema (`users` table) and admin-token logic.
- **How verified:** Attempt to insert a duplicate email; confirm unique violation.
- **Related business rules:** All user creation flows.
- **Current status:** ENFORCED.

### INV-DATA-02: `admin_tokens.token` is the primary key

- **Statement:** `admin_tokens.token` is the primary key and `admin_tokens.email` is unique.
- **Reason:** Each email can have at most one active token path.
- **Where enforced:** D1 schema.
- **How verified:** Inspect schema.
- **Related business rules:** RULE-AUTH-01.
- **Current status:** ENFORCED.

### INV-DATA-03: Project-department assignments are unique

- **Statement:** `project_departments` has a composite primary key `(project_id, department_id)`.
- **Reason:** A department is assigned to a project only once.
- **Where enforced:** D1 schema and `INSERT OR IGNORE` in `POST /api/projects`.
- **How verified:** Inspect schema.
- **Related business rules:** RULE-PROJECT-02.
- **Current status:** ENFORCED.

### INV-DATA-04: Newsletter subscriber email is unique

- **Statement:** `newsletter_subscribers.email` is unique.
- **Reason:** A single email cannot subscribe twice.
- **Where enforced:** D1 schema.
- **How verified:** Attempt duplicate subscription.
- **Related business rules:** RULE-NEWS-01.
- **Current status:** ENFORCED.

### INV-DATA-05: Instance team member uniqueness

- **Statement:** `instance_team_members` has a composite primary key `(team_id, user_id)`.
- **Reason:** A user can only be in a team once.
- **Where enforced:** D1 schema and explicit check in `POST /api/team-instances/:id/teams/:teamId/members`.
- **How verified:** Attempt to add the same member twice.
- **Related business rules:** RULE-TEAM-06.
- **Current status:** ENFORCED.

## Rate and quota invariants

### INV-RATE-01: Rate limits per IP and endpoint

- **Statement:** Each endpoint with `checkRateLimit` must allow no more than its configured max requests within the configured window from the same IP.
- **Reason:** Prevent abuse and protect D1/email quotas.
- **Where enforced:** `checkRateLimit` helper and `rate_limits` table.
- **How verified:** Exceed the limit from a single IP and confirm 429; restart the local Worker using the same D1 and confirm denial persists; send concurrent attempts and confirm only the configured allowance proceeds. Independent IP/endpoint keys retain separate allowances.
- **Related business rules:** RULE-RATE-01.
- **Current status:** ENFORCED.

### INV-QUOTA-01: Spacemail hourly send cap is 500 messages

- **Statement:** No more than 500 Spacemail SMTP messages may be sent per UTC hour, where one message carries up to 50 BCC recipients. The `email_queue` drain uses adaptive pacing (up to 15 messages per minute) so it never exceeds the hourly cap.
- **Reason:** Spacemail mailbox limits (500 messages/hour, 50 recipients/message) and deliverability protection.
- **Where enforced:** `sendEmail()`, `smtpSendMessage()`, `drainEmailQueue()` (cron `* * * * *`), and the `email_hour_count` table.
- **How verified:** Send more than 500 batches in an hour; confirm the queue stops and resumes next hour, and no further SMTP messages are attempted.
- **Related business rules:** RULE-QUOTA-01, RULE-QUOTA-02.
- **Current status:** ENFORCED.

### INV-QUOTA-02: Spacemail is the only email provider

- **Statement:** Every email is sent through Spacemail SMTP; there is no fallback provider. The queue uses at most 90% of each hour's limit so direct sends (OTPs, login tokens, welcome mails) always have room. Temporary session failures leave recipients queued; rejected recipients and permanent (5xx) session failures mark them failed; a Spacemail "too many messages" rejection marks the hour as used up.
- **Reason:** One sending identity keeps domain reputation consistent; without a fallback, sign-in mail must not be starved by bulk sends.
- **Where enforced:** `sendEmail()`, `isTransientSmtpError()`, `saturateHourlyEmailCount()`, `drainEmailQueue()`.
- **How verified:** Unset `SPACEMAIL_SMTP_PASS`: sends fail with "Email not configured" and no other provider is called. Fill `email_hour_count` to 90% of the limit: the queue pauses while an OTP still sends.
- **Related business rules:** RULE-QUOTA-01, RULE-QUOTA-03.
- **Current status:** ENFORCED.

### INV-QUOTA-03: Subscriber emails are sent one per recipient with their own unsubscribe link

- **Statement:** Newsletter and event campaigns are sent one message per subscriber, with the `%%UNSUBSCRIBE_URL%%` marker and `List-Unsubscribe` headers filled from that subscriber's `unsubscribe_token`. Every other queued campaign (meet notices, Send Mail lists) is also one message per recipient; no queued campaign uses BCC batches.
- **Reason:** A shared body would leak one subscriber's unsubscribe link to others; one-click unsubscribe needs a per-recipient URL.
- **Where enforced:** `drainEmailQueue()` (`personalizeUnsubscribe()`, `unsubscribeHeaders()`); templates render the marker when called without `subscriberEmail`.
- **How verified:** Queue a newsletter to two subscribers and confirm each delivered email links to a different `/unsubscribe/<token>` and carries `List-Unsubscribe-Post`.
- **Related business rules:** RULE-NEWS-02, RULE-NEWS-08, RULE-QUOTA-02.
- **Current status:** ENFORCED.

### INV-QUOTA-04: Queue campaigns are delivered exactly once and survive crashes

- **Statement:** An `email_queue` campaign advances its `cursor` by delivered+failed recipients and is marked `failed` after 5 consecutive claims that made no progress (`attempts` resets to 0 whenever a run advances the cursor, so long per-recipient campaigns spanning many cron runs are not cut off); a campaign stuck in `processing` for 10 minutes is reclaimable. For single-recipient campaigns each outcome is written to `email_deliveries` right after the send, and recipients already `sent`/`skipped` are never sent again (on reclaim or on `retry-failed`).
- **Reason:** A Worker request or cron invocation may die mid-send; recipients must not be lost or spammed repeatedly.
- **Where enforced:** `drainEmailQueue()` claim/stale logic in `apps/admin-api/index.ts`.
- **How verified:** Insert a campaign, kill the Worker mid-drain if possible, wait >10 minutes, confirm the next cron reclaims it from `cursor` and completes.
- **Related business rules:** RULE-QUOTA-04.
- **Current status:** ENFORCED.

## Content and security invariants

### INV-CONTENT-01: HTML content in case studies and newsletters is sanitized

- **Statement:** User-provided HTML is passed through `sanitizeBlogHtml` before storage.
- **Reason:** Prevent XSS and script injection.
- **Where enforced:** Case-study create/edit and newsletter create paths.
- **How verified:** Submit content with `<script>` tags; confirm they are removed.
- **Related business rules:** RULE-CASE-03.
- **Current status:** ENFORCED.

### INV-CONTENT-02: URLs are validated before storage

- **Statement:** `meet_link`, `fileUrl`, and `sourceFileUrl` values must pass `isValidUrl`.
- **Reason:** Prevent broken or malicious links.
- **Where enforced:** Meet, document, and file handlers.
- **How verified:** Submit an invalid URL; confirm 400.
- **Related business rules:** RULE-MEET-05.
- **Current status:** ENFORCED.

### INV-CONTENT-03: Announcement HTML is stripped

- **Statement:** Announcement title and content have all HTML tags removed before storage.
- **Reason:** Announcements are plain text.
- **Where enforced:** `POST /api/announcements`.
- **How verified:** Submit HTML; confirm it is stripped in the response/storage.
- **Related business rules:** RULE-ANN-02.
- **Current status:** ENFORCED.

## Newsletter editor invariants

### INV-NEWS-01: Newsletter editor access is restricted

- **Statement:** An email can use the newsletter editor only if it is in `newsletter_authorized_emails` or is a registered member with `power_level != 30`.
- **Reason:** Prevent unauthorized bulk email.
- **Where enforced:** `POST /api/newsletter-editor/otp/send`.
- **How verified:** Try to send an OTP with an unauthorized email; confirm 403.
- **Related business rules:** RULE-NEWS-04.
- **Current status:** ENFORCED.

### INV-NEWS-02: OTP has a 5-minute expiry

- **Statement:** `newsletter_otp_codes` rows expire 5 minutes after creation and can only be used once.
- **Reason:** Short-lived, single-use OTP.
- **Where enforced:** `POST /api/newsletter-editor/otp/verify`.
- **How verified:** Try to verify an expired or already-used OTP; confirm 400.
- **Related business rules:** RULE-NEWS-05.
- **Current status:** ENFORCED.

## Meet invariants

### INV-MEET-01: Meet links are hidden after the scheduled time

- **Statement:** List endpoints for meets return `meet_link = NULL` when the meet is more than 24 hours in the past.
- **Reason:** Past meet links should not remain visible.
- **Where enforced:** SQL in `GET /api/club-meets`, `GET /api/inter-dept-meets`, `GET /api/department-meets`.
- **How verified:** Create a meet scheduled in the past; list and confirm `meet_link` is null.
- **Related business rules:** RULE-MEET-01.
- **Current status:** ENFORCED.

## Team instance invariants

### INV-TEAM-01: Team member count respects `member_limit`

- **Statement:** A member cannot be added to a team if the team already has `member_limit` members, and `member_limit` cannot be lowered below the current count.
- **Reason:** Enforce team size caps.
- **Where enforced:** `POST /api/team-instances/:id/teams` and `PUT` and `POST .../members`.
- **How verified:** Try to add a member to a full team; confirm 400. Try to lower limit below current count; confirm 400.
- **Related business rules:** RULE-TEAM-07, RULE-TEAM-08.
- **Current status:** ENFORCED.

### INV-TEAM-02: Advisory members cannot be in teams

- **Statement:** A user with `role_id = 'advisory'` cannot be added to an instance team.
- **Reason:** Advisory members are not club operational members.
- **Where enforced:** `validateTeamMemberEligibility`.
- **How verified:** Try to add an advisory user to a team; confirm 400.
- **Related business rules:** RULE-TEAM-06.
- **Current status:** ENFORCED.

### INV-TEAM-03: Team instance management is department-scoped for directors

- **Statement:** Directors can only create/update/delete instances and teams where their department is in `instance_departments`.
- **Reason:** Department-level ownership.
- **Where enforced:** `canManageInstanceTeams` helper.
- **How verified:** Try to update an instance in another department; confirm 403.
- **Related business rules:** RULE-TEAM-04.
- **Current status:** ENFORCED.

### INV-FILE-01: Shared library cannot cross private storage namespaces

- **Statement:** Club Files reads and writes are restricted to flat `general/`, `projects/` and `events/` objects. A guessed private document ID cannot grant download/delete access through this library, even to a board member.
- **Where enforced:** `club-file-policy.ts` and canonical Club Files routes.
- **How verified:** Local R2 fixtures under Letter Studio and nested paths remain absent from lists and denied by direct ID; shared uploads/downloads and role restrictions still work. Helper tests cover continuation pages and ambiguous/partial IDs.
- **Remaining:** New contextual attachments must enforce their owning resource's current permissions on every request.

### INV-WORK-01: Personal queue follows current access

- **Statement:** Open assigned tasks only appear while the user may currently read the owning project. Pending role invitations only count for their recipient. Board account approvals never appear in lower-power responses.
- **Where enforced:** `/api/work-queue`, using canonical project read scope and current user/department.
- **How verified:** Local role fixtures exercise owned versus inaccessible assignments, explicit-role removal, department movement, completed tasks, board-only attention and meeting scope.

Task due dates are valid calendar dates, independent of project deadlines. A member's owned-task status permission never grants schedule-edit permission. Schedule writes match both task and project, compare the previous schedule to prevent a concurrent overwrite, and commit an audit record only when a row changes.

Task assignment cannot grant project read access. Creation and reassignment enforce active owner registry access and current project scope at the SQL write. Combined edits compare previous owner, due date and priority; only one competing edit of the same snapshot can commit, and only its audit is recorded. A reassignment changes owned-task permission immediately on the next request.

Task history must recheck current project access and task-project membership for every page. Raw audit JSON and actor email are never sent through this endpoint. Creation and bulk completion events commit with their task writes; bulk retries cannot reset completed timestamps or add false status events. Same-second history retains append order.
