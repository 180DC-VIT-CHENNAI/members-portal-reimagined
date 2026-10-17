# Business Logic — 180DC VIT Chennai Platform

This document describes the system from the domain perspective. Each section covers a capability, its actors, rules, and state changes.

## Void portal email rules

These rules apply to the separate `apps/portal` deployment while the legacy deployment remains live.

- Mail goes through Cloudflare Email Sending (`sendEmail` from `void/email`) from `noreply@180dc.vitcc.org`, the only sender the binding allows (ADR-008). Mail a person writes carries Reply-To set to that person. Campaigns send one message per recipient, never BCC batches; the minute cron awaits one claimed campaign.
- Hourly capacity is reserved atomically in D1 before sending, shared by direct and queued mail. Failed sends release reservations; a crash may conservatively retain a reservation until the hour changes. The default allowance is 500/hour; campaigns stop at 90% of that allowance and attempt at most 15 recipients per invocation, paced 1.5 seconds apart.
- Daily counts are reporting, not a 100/day cap. This follows the legacy implementation rather than the obsolete cap description.
- A recipient-level error (`INVALID_TO`, `UNVERIFIED_DESTINATION`, `MIME_ERROR`, `OUTCOME_UNKNOWN`) is recorded as failed and does not block subsequent recipients. A missing binding, an unready sender or a provider outage pauses without advancing the cursor, and Cloudflare's quota errors also mark the hour as used. Five no-progress claims make a campaign eligible for failure on the next drain.
- Settled recipients are skipped on explicit retry. An `OUTCOME_UNKNOWN` failure may already have been accepted, so it is never resent automatically; retrying it is a deliberate choice. Acceptance and the delivery record are not transactional, so crash recovery can resend a message; acceptance is not a guarantee of inbox delivery.
- Campaign inspection and retries are global administrative permissions (`email.view`, `email.manage`). Department-scoped `email.send` restricts recipients server-side to active/on-leave people in those departments. Titles never grant mail access.

## Authentication and sessions

On `reimagined`, token sign-in uses `POST /api/auth/session` in all environments. It exchanges the existing registry credential for a new device session with fixed seven-day expiry. A registry-only onboarding account may create its user row only while the source token remains active. Every device request loads current identity/role and verifies its session and source registry state; role changes take effect without reissuing the session. Source-token revoke/delete/rotate invalidates its device sessions. Individual session revocation is account-owner scoped. Member removal batches registry and identity deletion to prevent concurrent exchange from recreating the removed member.

The web portal stores the session credential under the existing `authToken` key and uses the server expiry. Token and Google sign-in exchange into this session path; Google identity is verified by the Worker's own OAuth flow described below. Sign-out attempts server revocation then clears local credentials. Profile shows owner-scoped session management without displaying device credentials. Source token rotation exchanges the newly issued credential and updates parent UI state. Offline sign-out clears local access but cannot guarantee remote revocation until a server request succeeds.

On `reimagined`, browser writes with an explicit `Origin` must match a legacy or configured `ALLOWED_WEB_ORIGINS` origin, including JSON requests. CORS and CSRF use the same exact-origin policy. Requests still need their existing token or editor-session authentication; this policy grants no resource permissions. Local loopback development retains its existing exception.

### Actors
- Public visitor.
- Member with a token.
- Member with a linked Google account.

### Workflows

#### Token login (RULE-AUTH-01)

1. User provides a token at `/members`.
2. Frontend posts `POST /api/dev-login`.
3. Backend validates the token against `admin_tokens`.
4. If the token is not revoked and not expired, the user is looked up by email in `users`.
5. If no user exists, the backend auto-creates a user from the token's `email`, `name`, and `role_id`.
6. The response includes `email`, `name`, `roleId`, `roleName`, `powerLevel`, and `departmentId`.
7. Frontend stores the token and profile in `sessionStorage` and `localStorage`.

#### Google sign-in (RULE-AUTH-02)

1. User clicks "Sign in with Google" on `/members`; the browser navigates to `GET /api/auth/google/start`.
2. The Worker stores a single-use state (hashed, 10-minute TTL, with a PKCE verifier) in `oauth_states`, sets the HttpOnly `g_oauth_state` cookie, and redirects to Google.
3. Google redirects to `GET /api/auth/google/callback`. The Worker requires the cookie to match the state, deletes the state, exchanges the code with `GOOGLE_CLIENT_SECRET` and the PKCE verifier, and checks the ID token's issuer, audience, expiry and subject.
4. The Worker finds exactly one member with that `users.google_sub` and `oauth_enabled = 1`, with an active (unrevoked, unexpired) registry token. Email never selects an account.
5. It issues the same member session as token sign-in, stores it under a single-use 60-second handoff code in `oauth_handoffs`, and redirects to `/members?google_code=...`.
6. The frontend posts the code to `POST /api/auth/google/exchange` and stores the returned session. Failures redirect to `/members?google_error=<code>`.

#### Token rotation (RULE-AUTH-03)

- Any authenticated member can rotate their own token via `POST /api/auth/rotate-token`.
- The old token is deleted; a new token is generated and emailed.

#### Link/unlink Google (RULE-AUTH-04)

- A signed-in member starts linking from Profile via `POST /api/auth/google/link-start`, which returns the Google URL for a state bound to that member. The callback sets `users.google_sub` and `oauth_enabled = 1` and redirects to `/members?google=linked&panel=profile`. Linking proves possession of both the member session and the Google account; email equality is not required.
- A single conditional D1 update prevents one Google account being linked to two members (`google_error=already_linked`). Link/unlink changes are audited (`google_linked`, `google_unlinked`).
- `POST /api/auth/google/unlink` clears the link and sets `oauth_enabled = 0`. Existing device sessions are revoked separately through account session controls.
- Clerk was removed; former Clerk links do not carry over, so those members link Google again once.

### Business rules

- RULE-AUTH-01: A token must be unrevoked and unexpired to log in.
- RULE-AUTH-02: Google sign-in only works if the Worker-verified Google account is linked (`users.google_sub`) to exactly one member with `oauth_enabled = 1` and active registry access. It never creates or restores a registry token.
- RULE-AUTH-03: Tokens are deleted and regenerated on rotation, not stored hashed.
- RULE-AUTH-04: The `forgot-token` endpoint always returns success to prevent email enumeration.
- RULE-AUTH-05: Maintenance mode blocks all members with `power_level < 100`.
- RULE-AUTH-06: Token login via `/api/auth/session` works in production; `dev-login` does not.

## Roles and permissions

### Actors
- System (seeded roles).
- Board member (`power_level >= 100`).
- Director (`power_level = 50`).
- General member (`power_level = 10`).
- Advisory member (`power_level = 30`).

### State

- `roles(id, name, power_level, created_by)`.
- `users(id, name, email, role_id, department_id, secondary_role_id, ex_title, clerk_user_id (legacy, unused), google_sub, oauth_enabled, created_at)`.

### Business rules

- RULE-ROLE-01: System seeds board roles with `power_level = 100`, director roles with `power_level = 50`, `member` with `10`, and `advisory` with `30`.
- RULE-ROLE-02: Custom roles can only be created with `power_level < 100`.
- RULE-ROLE-03: Board members can create/assign roles and departments.
- RULE-ROLE-04: Directors can only manage users and meets in their own department.
- RULE-ROLE-05: Advisory members cannot be added to team instances.
- RULE-ROLE-06: Board members cannot be deleted.
- RULE-ROLE-07: When a member's role is changed via `/api/members/:id/role`, a role-change email is sent.

### Role transfer workflow

1. Board creates a transfer from user A to user B for role R.
2. If both A and B accept (`/api/my-role-transfers/:id/accept`), the system assigns R to B and `member` to A.
3. Board can approve or reject via `/api/role-transfers/:id/approve` or `/reject`.
4. Board-level roles (`power_level = 100`) cannot be transferred.

## Member lifecycle

### Workflows

#### Add member (RULE-MEMBER-01)

- Board uses `POST /api/members` to add a new general member.
- A user is created with `role_id = 'member'`.
- Any prior `admin_tokens` row for that email is deleted.
- A new token is generated and emailed.

#### Add board user (RULE-MEMBER-02)

- Board uses `POST /api/board-users`.
- The target role must have `power_level >= 50`.
- If the email already exists, the user is updated.
- A token is generated and emailed.

#### Add advisory member (RULE-MEMBER-03)

- Board uses `POST /api/advisory-members`.
- The user is created or updated with `role_id = 'advisory'`.
- An optional `ex_title` and `department_id` can be set.
- A token is generated and emailed.

#### Approve signup request (RULE-MEMBER-04)

- Public user submits `POST /api/signup-requests`.
- Board sees pending requests.
- On approval, a user is created as `role_id = 'member'` in the requested department.
- A token is generated and emailed.

#### Remove member (RULE-MEMBER-05)

- Board uses `DELETE /api/members/:id`.
- Board members cannot be removed.
- Related `admin_tokens` and `role_transfers` are cleaned up.

## Departments

### Actors
- Board (can manage all).
- Director (can manage own department).
- Member (can view own department).

### State

- `departments(id, name, description)`.
- Seeded departments: `tech`, `finance`, `crm`, `operations`, `business_strategy`, `marketing`.

### Business rules

- RULE-DEPT-01: Directors can only access and manage their own department.
- RULE-DEPT-02: Board members can access and manage all departments.
- RULE-DEPT-03: Department meets, documents, instructions, and projects are scoped to the department.
- RULE-DEPT-04: Department routes enforce access with an awaited check. Reading a department's instructions and member list (`GET /api/departments/:id/instructions`, `/members`) is open to board and to anyone in that department (`canViewDept()`); everything else (overview, documents, meets, projects, all writes) needs board or that department's director (`canAccessDept()`).

### Department panel capabilities

- Schedule meets (`department_meets`).
- Post documents (`department_documents`).
- Post instructions (`department_instructions`) with priority `low`/`medium`/`high`.
- Track small projects (`department_projects`).
- View department member list.

## Meets

### Types

- Club-wide (`club_meets`): all members.
- Department (`department_meets`): one department.
- Inter-department (`inter_dept_meets`): comma-separated list of department IDs.

### Actors

- Board can create all meet types.
- Directors can create department meets for their own department.
- Requirement for creating club-wide or inter-department meets is `power_level >= 50` in code, not strictly board.

### Business rules

- RULE-MEET-01: Meet links are hidden from list responses when `julianday(scheduled_at) < julianday('now', '-1 day')`.
- RULE-MEET-02: Creating a meet can trigger email notifications to eligible members.
- RULE-MEET-03: Meet notification recipients are enqueued in `email_queue` (kind `meet`) and delivered by the cron drain; the legacy `pending_emails` overflow is auto-migrated into the queue.
- RULE-MEET-04: `POST /api/meets/process-queue` still flushes legacy `pending_emails` rows synchronously.
- RULE-MEET-05: Meet links must be valid URLs if provided.

## Projects

### Global projects

- `projects(id, name, description, company_org, year, deadline, status, created_by, created_at)`.
- `project_departments(project_id, department_id)`.
- `project_roles(id, project_id, user_id, role_name, created_by)`.
- `project_tasks(id, project_id, title, description, assigned_to, status, created_by, completed_at, created_at)`.

### Business rules

- RULE-PROJECT-01: Only board members can create global projects.
- RULE-PROJECT-02: A project must be assigned to at least one department.
- RULE-PROJECT-03: If a deadline is provided, the year is derived as `YYYY-YYYY+1`; otherwise a manual year is required.
- RULE-PROJECT-04: Directors and board can assign project roles; directors can only assign on projects where their department is assigned.
- RULE-PROJECT-05: Directors and board can manage tasks on projects where their department is assigned.
- RULE-PROJECT-06: Board can mark a project complete or reopen it.
- RULE-PROJECT-07: Marking complete or reopening regenerates the static `completedProjects.json` in R2.
- RULE-PROJECT-08: The `GET /api/projects/completed` endpoint reads from R2; falls back to D1.
- RULE-PROJECT-09: On `reimagined`, internal project reads and active dashboard counts are scoped to board access, the user's assigned department, or an explicit `project_roles` assignment. Having no department is not a visibility grant. Task URLs enforce the same rule. Removing a role takes effect on the next request unless another valid grant remains.
- RULE-PROJECT-10: Members may complete/reopen only their own assigned tasks in projects they can currently read. Board and project-department directors retain management access. Status changes compare the current status/assignee before writing, return 409 on conflict, and use a transactional audit insert. A repeated status request succeeds without changing the completion timestamp or adding history.
- RULE-PROJECT-11: New task assignees must be registered and able to read the project. A task ID under the wrong project cannot be updated; missing tasks do not report success.

### Department projects

- `department_projects` are separate from global projects.
- Directors can create and update status for their department.
- Used for department-level work tracking.

## Case studies

### Business rules

- RULE-CASE-01: Any authenticated member (`power_level >= 10`) can create or edit case studies.
- RULE-CASE-02: Lead or above (`power_level >= 50`) can delete case studies.
- RULE-CASE-03: Content is sanitized with `sanitizeBlogHtml`.
- RULE-CASE-04: Content must be at least 10 visible characters after sanitization.
- RULE-CASE-05: Image uploads are limited to 10 MB and JPEG/PNG/WebP/GIF.
- RULE-CASE-06: Source file URLs can point to `CASE_STUDIES` R2 objects under `source/`.

## Club files

### Business rules

- RULE-FILE-01: Leads and above (`power_level >= 50`) can upload and delete club files.
- RULE-FILE-02: All members can list, search, filter, and download.
- RULE-FILE-03: Files are stored in R2 `CLUB_FILES` with custom metadata.
- RULE-FILE-04: Upload category is one of `general`, `events`, `projects`.
- RULE-FILE-05: File listing filters by category, event, project, and free-text search.

## Newsletter

### Public subscription

- RULE-NEWS-01: Public visitors subscribe with email double opt-in: `POST /api/newsletter/subscribe` always replies `pending` with the same message (no address enumeration) and emails a 48-hour single-use link to `/subscriber?confirm=<token>`; the subscription becomes active only when the page posts that token to `POST /api/newsletter/confirm` (a POST, so mail scanners cannot confirm).
- RULE-NEWS-02: Every subscriber has a random `unsubscribe_token`. Newsletter, event, and welcome emails link to `https://180dcvitc.org/unsubscribe/<token>` and carry `List-Unsubscribe: <https://180dcvitc.org/api/newsletter/unsubscribe/<token>>` with `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. Unsubscribing is a POST (`/api/newsletter/unsubscribe/:token`) so link-prefetching scanners cannot trigger it. The legacy `GET /api/newsletter/unsubscribe?email=...` stays for links in older emails.
- RULE-NEWS-03: The system stores `active`, `subscribed_at`, and `unsubscribed_at` in `newsletter_subscribers` in `NEWSLETTER_DB`. Subscribing sends a welcome email (re-subscribing sends a welcome-back email) synchronously; delivery failures are logged.
- RULE-NEWS-03a: `GET /api/newsletter/:id` is public, rate-limited, and serves newsletter `content` only after sanitization (`sanitizeBlogHtml`) — never raw stored HTML. The separate newsletter site (ADR-004) fetches this endpoint.
- RULE-NEWS-03b: The bulk-email CTA uses `NEWSLETTER_SITE_URL` when set (CTA → `{site}/newsletter/{id}`) and otherwise falls back to `https://180dcvitc.org/#newsletter`. The production var is intentionally empty until the separate newsletter site (ADR-004) is deployed. Bulk templates render the `%%UNSUBSCRIBE_URL%%` marker, which the queue drain replaces per recipient.

### Newsletter editor (OTP)

- RULE-NEWS-04: Access requires an email in `newsletter_authorized_emails` or a registered member with `power_level != 30`.
- RULE-NEWS-05: A 6-digit OTP is emailed and expires in 5 minutes.
- RULE-NEWS-06: A successful OTP verification creates a 24-hour session in `newsletter_sessions`.
- RULE-NEWS-07: Editors can create drafts, upload source files, and send newsletters or event emails.
- RULE-NEWS-07a: An editor can update only their own drafts and the shared `editorial-sync` drafts (the ones `GET /drafts` shows them); updating anyone else's returns 403.
- RULE-NEWS-08: Bulk sends insert one `email_queue` campaign and return `queued`/`total` immediately; the cron sends one personalized message per subscriber (1.5 s apart, within the 500-messages/hour Spacemail cap), skips subscribers who unsubscribed after the campaign was queued (except test sends), records each outcome in `email_deliveries`, and updates `recipient_count` on completion. Board members can retry only the failed recipients via `POST /api/admin/email-queue/:id/retry-failed`.
- RULE-NEWS-09: Source files are stored in `CASE_STUDIES` R2.

### Board newsletter management

- RULE-NEWS-10: Board can create, update, delete, and send newsletters from the members portal.
- RULE-NEWS-11: Board can manage authorized newsletter editor emails.

## Consulting requests

### Business rules

- RULE-CONSULT-01: Public visitors can submit a consulting request.
- RULE-CONSULT-02: Board can list, accept, reject, and delete requests.
- RULE-CONSULT-03: Accept/reject sends a custom email through the unified email path (Spacemail SMTP).
- RULE-CONSULT-04: A request can only be accepted or rejected once.

## Announcements

### Business rules

- RULE-ANN-01: Board can create and delete announcements.
- RULE-ANN-02: Title and content are stripped of HTML tags.
- RULE-ANN-03: All members can view announcements.

## Maintenance mode

### Business rules

- RULE-MAINT-01: Board can enable/disable maintenance mode. The change applies immediately in the isolate that handled it; other isolates pick it up within the 60 s cache.
- RULE-MAINT-02: When enabled, all members with `power_level < 100` receive a 503 response from authenticated routes.
- RULE-MAINT-03: The public maintenance status endpoint is readable without auth.

## Team instances

### Business rules

- RULE-TEAM-01: Board and directors can create instances.
- RULE-TEAM-02: Directors can only create instances for their own department.
- RULE-TEAM-03: Advisory members cannot view team instances.
- RULE-TEAM-04: Board can manage any instance; directors can manage instances where their department is in `instance_departments`.
- RULE-TEAM-05: Teams can have optional `min_members` and `member_limit`.
- RULE-TEAM-06: Team members must be registered users and cannot be advisory.
- RULE-TEAM-07: Adding a member checks the `member_limit`.
- RULE-TEAM-08: Lowering `member_limit` below the current count is rejected.
- RULE-TEAM-09: `min_members` may be set above the current count to flag the team as under-staffed.

## Rate limiting and email quota

### Business rules

- RULE-RATE-01: Endpoints using `checkRateLimit` consume one attempt per IP/endpoint through an atomic D1 upsert. Fixed-window state survives isolate restarts and is shared across workers. A denied request retains the window, with a positive `retryAfter`; counts saturate at limit + 1. Database failures deny the operation rather than falling back to memory.
- RULE-RATE-02: Login uses the same persistent limiter. Every attempt is counted once, including successful logins. Development login neither increments failed attempts twice nor resets its allowance on success.
- RULE-QUOTA-01: All outbound email goes through `sendEmail()` and Spacemail SMTP (`mail.spacemail.com:465`) — the only provider. Temporary session failures stay queued, rejected recipients and permanent (5xx) failures are marked failed, and a "too many messages" rejection pauses the queue until the next hour.
- RULE-QUOTA-02: No send uses BCC batching; every queued campaign (newsletter, event, meet, Send Mail) and every direct send is one recipient per message. SMTP sends are capped at 500 messages/hour in `email_hour_count` and drained with adaptive pacing (up to 15 messages/minute) by the `* * * * *` cron.
- RULE-QUOTA-03: The queue uses at most 90% of the hourly SMTP limit; the rest is reserved for direct sends (OTPs, login tokens, welcome mails).
- RULE-QUOTA-04: Bulk sends (newsletter, event, meet, and Send Mail lists over 10 recipients) insert an `email_queue` campaign and return `queued`/`total`; the cron carries the campaign to completion, pacing adaptively up to the 500/hour cap, and retries up to 5 times. Send Mail lists of 10 or fewer are sent synchronously (one message per recipient).
- RULE-QUOTA-05: Sends with no email provider configured fail without calling any provider; OTP and letter sends return 500.
- RULE-QUOTA-06: Newsletter data lives in the separate `NEWSLETTER_DB`; the cron writes campaign completion (`sent_at`, `recipient_count`) back to `newsletters` there.

## Audit logging

### Business rules

- RULE-AUDIT-01: Significant actions write a row to `audit_log`.
- RULE-AUDIT-02: Audit log entries are append-only.

## Shared files and private namespace isolation

The legacy Club Files library is shared with authenticated users at power >= 10 and managed by power >= 50. Its approved categories are General, Projects and Events; only flat keys in these namespaces are eligible. Listing and exact-ID download/delete never traverse Letter Studio or nested/private namespaces. Ambiguous IDs fail closed. Filters retain their existing display-metadata meaning and scan continuation pages. Upload category is validated before R2 writes; unsafe extension strings become `bin`. Downloads are private attachments with encoded filenames and no-store/nosniff headers.

This boundary preserves the shared legacy library; it does not make display project names authoritative resource links. Contextual project/task/meeting/department attachments and guests still require metadata records, owning-resource authorization and separate private storage keys.

## Today work queue

The authenticated home exposes a personal queue of open assigned tasks in projects currently readable under the canonical project policy. Assignment does not independently grant read access; department moves and explicit-role removal recalculate visibility on the next request. Completed tasks/projects are omitted. Existing project deadlines are displayed as project dates rather than inventing individual task due dates. Completing a task from Today uses the existing assignee-authorized, transactionally audited task status API, followed by a fresh queue read.

The next-seven-day meeting list includes club meetings plus current department/inter-department meetings; board operators may see all departments. Only future meetings appear, preserving the 24-hour stale-link restriction. Pending incoming transfers are owner-scoped, and account-request counts are board-only. The web card shows loading/errors, a server freshness timestamp, manual refresh and a visible-page refresh every minute. Old credential fetches are aborted or ignored on account changes. It links to Projects, Transfers and board Admin Console.

Individual task dates/priority/blockers, department review queues, mentions, unread updates and Recent activity require subsequent models and UI. This initial queue does not claim those capabilities.

The initial Android client consumes the same session/work-queue/task contracts. It requires a configured personal HTTPS origin, persists only the issued device session through SecureStore, validates saved access before restoring protected content, clears expired/revoked visible state and ignores late responses after teardown. Logout tries local deletion and remote revocation independently; incomplete results are shown. No private persistent offline cache or native approval action screen is implemented yet. Native storage/lifecycle acceptance remains pending.

Android restoration treats SecureStore values as untrusted serialized input: only the expected device credential, valid future expiry and identity fields are accepted. Invalid values are removed before server restoration. HTTP 401 remains an authentication error even when its body is not JSON, so the client can clear visible access consistently. Malformed successful responses fail explicitly rather than being treated as work data.

Android device-session controls use the same owned-session list and revoke endpoints as the web. Device labels are user supplied. Revoking the current Android session clears protected content and attempts to remove its saved credential; other-device revocation refreshes the list. Requests and confirmation callbacks are discarded when the screen/account lifetime changes. Native emulator acceptance remains pending.

Project task scheduling: leads who can manage the project may set/clear task calendar due dates and choose low/normal/high/urgent priority. Members can still complete their own tasks without gaining scheduling rights. Both Today clients display task due dates separately from project deadlines. Schedule edits preserve omitted fields and record attributable before/after audit; identical retries preserve history. Task reassignment, blockers, boards, comments and history UI remain additional work.

Project leads can reassign or unassign tasks together with scheduling edits in the web task-details editor. The old owner stops receiving the task in Today and loses owned-task completion permission; the new owner receives the same task with its due date/priority and can complete it. Assignment requires active account and project access, checked again by the write. Assigning a task does not itself grant project access. The editor captures previous values when opened; conflicts retain the draft and offer Reload task before a fresh edit. Delayed task requests are ignored after an account/project change. Native task-detail editing, blockers, boards and collaboration remain pending.

Members with current project read permission can review a task's scoped history in the web task list, load older events and refresh. It covers recorded creation, individual status changes, bulk completion, scheduling and combined owner/date/priority edits. Missing historical events are described as unavailable rather than invented. Only relevant task fields and actor display names are returned; unrelated audit details and emails stay private. Access-denial refreshes clear displayed history, including non-JSON denials. Native history UI remains pending.
