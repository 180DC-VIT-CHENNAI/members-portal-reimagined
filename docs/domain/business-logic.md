# Business Logic — 180DC VIT Chennai Platform

## CRM pipeline and intake

CRM visibility is per record: owner, explicit grant (an organisation grant covers its children) or `crm.admin`. Contact private fields need organisation or contact access. Consulting-request conversion is idempotent through the unique opportunity link and reuses organisations by normalised domain and contacts by email. Won is reached only by accepting a sent proposal, which creates one engagement and its project in one batch; closeout requires the checklist, and a case-study draft exists only with consent and is never published.

## Shared mailbox review and dispatch

Mailbox capabilities are independent resource grants. Manager/admin status never silently grants inbox reads or send authority, and a person cannot grant themselves mailbox capabilities. Current personnel status and grant validity are enforced on reads and again on dispatch.

A saved draft is a frozen revision. Submission identifies that revision; approval records its content digest and policy version and requires the reviewer's approve/send rights. A distinct reviewer is required by default, including when the last editor has broad rights. Editing creates a new snapshot and cancels any pending send authorization. The first release always requires approval, even if a policy record predates that restriction.

Sending writes a stable, idempotent intent. The dispatcher loads required private attachment bytes, verifies their digests, then atomically claims an eligible intent while rechecking author/reviewer/sender grants, personnel status, mailbox state, current approval and policy and both pause switches. One claim produces one automatic provider attempt. A crash/exception after a provider call begins is uncertain, never an automatic replay. Acceptance is not inbox delivery.

Live business transport is disabled by default. Cloudflare is restricted to existing correspondence replies, not prospecting; that adapter cannot send until the approved shared address is present in the sender binding. Capture transport is development-only. Existing transactional mail and newsletter workflows keep their separate permissions/identities.

## Portal onboarding and collaboration

- Notification quiet hours apply separately to task and mention badges in India time. An overnight interval spans midnight; its start is inclusive and its end exclusive. Quiet hours retain unread inbox entries and restore their badge contribution afterward, subject to current access and the category's in-app switch.
- Invitations validate their complete input before writing. Person, optional tenure, queued invitation and audit are atomic. Import dry runs never queue mail. Invitation links use the canonical production portal, not an arbitrary browser Origin.
- Onboarding is a nonblocking checklist. Profile progress is derived; read and hide actions are explicit and person-owned. Optional phone and registration fields never gate progress.
- Assigning work and posting a comment atomically create deduplicated in-app notices for relevant other people. An hourly job at minute 5 UTC creates deadline notices for visible open/blocked tasks due today or tomorrow; repeated runs do not duplicate them. Current access filters labels, paging and unread counts.
- Client and department work use the same project workspace. Department project managers can manage internal work only when their grant covers every linked department. Converting internal work into publishable work requires the ordinary project-management grant. Completing internal work never publishes it.
- The additive migration copies only existing portal-local department records and keeps the source table and old identifiers for compatibility. No legacy Worker records are imported.
- Task blocking requires a reason; unblock/complete clears it and retains version checks and history. Today includes blocked work and applies visibility before its result limit.
- Meeting managers edit plain-text agendas/notes without sending announcements. Action items link existing tasks; viewers see a linked task only if they already have access to its project. Meeting access never grants project access.
- Private project/task files use the existing storage adapter and shared type/size policy, but never shared-file listing or guessed shared download routes. Management rights are checked again on every mutation.
- Team instances open on Roster; staffing and progression are advanced views, not separate services.

## Void portal letter studio rules

- Current Google principals and `letters.manage`/`letters.send` replace the standalone OTP allowlist. Admins hold both globally, directors for their department. Positions and typed team labels never grant access.
- All 13 existing document types remain available. Composition, preview and local PDF export run in the browser; saving freezes the PDF and its metadata. Sending uses the saved snapshot, even if the composer has since changed.
- Each saved PDF has a separate explicit access department. Null means global-only. Downloads and history are private and scoped; the general shared-file APIs cannot expose `letters/` objects.
- Scoped senders address only active/on-leave personnel in their permitted departments. Global senders can address external recipients. A send request UUID binds the actor, saved document and recipient and prevents duplicate submissions.
- Saving accepts PDFs up to 20 MiB; email is limited to 3 MiB raw PDF to stay under the provider's encoded-message ceiling. Larger documents remain downloadable/printable. Required missing PDFs fail instead of silently sending without the document.
- Queued, provider-accepted, failed and unknown outcomes are distinct. Durable send history survives campaign cleanup. A provider-unknown outcome requires an explicit retry decision, which can duplicate a message.
- Template references are deterministic hashes and need not be unique. Printed signature artwork/text is not a cryptographic signature. Static legacy signatory/tenure text must be reviewed before issuing official correspondence.

## Void portal newsletter rules

- Subscribers confirm email ownership; they are not personnel and do not need Google. Pending or unsubscribed addresses never enter a real broadcast. Subscribe responses do not reveal whether an address is active.
- Confirmation credentials are hashed, expire after 48 hours and are claimed once atomically. Resubscribing requires confirming again and retains the original unsubscribe capability.
- An unsubscribe link requires a button or email-provider one-click POST. Entering an address requests a personal link, not removal of someone else's subscription. An explicit unrelated browser Origin is rejected.
- Newsletter editors use Google and current global grants. Admins edit/send/manage, directors edit/send, members edit, advisory members none. Drafts are owned or explicitly shared; tests only go to self. Positions never grant access.
- Issue numbering and concurrent broadcast claims are atomic. Queued mail is an immutable snapshot; editing/deletion is blocked during sending. Completed real broadcasts with at least one accepted recipient publish the issue; tests and zero-acceptance sends do not. No public draft route exists.
- Every broadcast delivery rechecks the current subscriber and skips inactive or erased addresses. Footer links and RFC 8058 headers are personalized one recipient at a time. Accepted mail is not proof of inbox delivery or exactly-once delivery.
- Uploaded sources up to 20 MiB are downloadable; sources up to 3 MiB may also be attached. Missing required attachments fail without sending an incomplete issue. Subscription erasure and its audit commit together without retaining the email in audit details.

This document describes the system from the domain perspective. Each section covers a capability, its actors, rules, and state changes.

## Void portal email rules

These rules apply to the separate `apps/portal` deployment while the legacy deployment remains live.

- Mail goes through Cloudflare Email Sending (`sendEmail` from `void/email`) from `noreply@180dc.vitcc.org`, the only sender the binding allows (ADR-008). Mail a person writes carries Reply-To set to that person. Campaigns send one message per recipient, never BCC batches; the minute cron awaits one claimed campaign.
- Hourly capacity is reserved atomically in D1 before sending, shared by direct and queued mail. Failed sends release reservations; a crash may conservatively retain a reservation until the hour changes. The default allowance is 500/hour; campaigns stop at 90% of that allowance and attempt at most 15 recipients per invocation, paced 1.5 seconds apart.
- Daily counts are reporting, not a 100/day cap. This follows the legacy implementation rather than the obsolete cap description.
- A recipient-level error (`INVALID_TO`, `UNVERIFIED_DESTINATION`, `MIME_ERROR`, `OUTCOME_UNKNOWN`) is recorded as failed and does not block subsequent recipients. A missing binding, an unready sender or a provider outage pauses without advancing the cursor, and Cloudflare's quota errors also mark the hour as used. Five no-progress claims make a campaign eligible for failure on the next drain.
- Settled recipients are skipped on explicit retry. An `OUTCOME_UNKNOWN` failure may already have been accepted, so it is never resent automatically; retrying it is a deliberate choice. Acceptance and the delivery record are not transactional, so crash recovery can resend a message; acceptance is not a guarantee of inbox delivery.
- Campaign inspection and retries are global administrative permissions (`email.view`, `email.manage`). Department-scoped `email.send` restricts recipients server-side to active/on-leave people in those departments. Titles never grant mail access.

## Void portal meets rules

These rules apply to the separate `apps/portal` deployment.

- A meet is club-wide, for one department, or inter-department (one or more departments). Meets are stored in `meets`, and their departments in `meet_departments`.
- Directors schedule club-wide and inter-department meets for any departments, and department meets for their own department; admins manage every meet; members and advisory members only view. Titles never grant these rights.
- Everyone with access sees club-wide and inter-department meets. Department meets are visible to that department (admins see all).
- Scheduling queues one announcement campaign, one message per recipient, from `180DC Admin` with Reply-To set to the scheduler. The audience is active and on-leave people: everyone for club-wide meets except advisory members without a department, otherwise exactly the people whose home department is selected. Re-announcing queues a new campaign; removing a meet does not cancel queued ones.
- A meet's link is hidden from every read once the meet is more than 24 hours past, and re-announcements of such meets omit it. The stored link is unchanged.

## Void portal projects rules

These rules apply to the separate `apps/portal` deployment.

- A project belongs to one or more departments, may be tied to a term, and is upcoming, active, on hold or completed. Only completed non-internal projects are public: their name, client and description are listed on the landing page.
- Client-project visibility follows `projects.view` or project-management grants over its departments, or named membership. Internal work first requires workspace-read authority, department-project management over all linked departments, or explicit named membership. Client-only management grants cannot establish internal eligibility. Everyone else gets 404.
- Editing, completing, reopening or deleting a project needs `projects.manage` covering all of its departments. Admins hold it globally; a department-scoped grant reaches only projects wholly in that department. Naming people and managing tasks need `projects.members.manage` or `projects.tasks.manage` covering any one of its departments; directors hold these for their own department. Being named on a project never grants management, whatever the role on it.
- Creating a project emails its departments' leads, meaning the people in those departments who manage tasks there (not the creator). Naming someone on a project emails them.
- Tasks can only be assigned to people with access who can see the project. The assignee or a task manager marks a task done or open again; task managers create, edit, reassign and remove tasks. Every change raises the task's version, and an edit or status change based on an older version is refused with 409.
- Taking someone off a project leaves their tasks assigned to them; they stop seeing the project unless their department lets them.
- Task changes go to the audit log (`task.create`, `task.status`, `task.update`, `task.delete`) with the project and the before and after values, for the task history in slice 5b.

## Void portal task activity and Today

- Every current project reader can comment, not just assignees and managers. The author or a task manager can remove a comment. Bodies are plain text, and removed bodies are erased while the thread retains a marker.
- Clients choose a UUID per draft and retain it across retries. A matching retry returns the original comment; reuse for different text/target or after removal conflicts. Comment creation/removal and their audit records are transactional, and no-op retries create no audit entry.
- Task history is available to project readers without global audit access. It is projected from five allow-listed task action types and fields; private descriptions, comment bodies, comment ids and raw audit details never enter the history response. Both feeds page backwards by integer ids, not timestamps.
- `/today` is the default signed-in home. It shows open assigned tasks on active projects the person can still see, relevant meetings in the next seven days, three latest announcements and permission-scoped invite/email attention counts. Assignment alone never preserves project access. Refresh runs on demand and when the page becomes visible again.
- The project page opens Comments/History lazily per task. A failed access refresh clears the private feed. Comment count excludes removed comments. The Today done box uses the same assignee/manager status endpoint as the project page.


## Void portal team instances rules

These rules apply to the separate `apps/portal` deployment.

- A team instance is the staffing and progression board for one competition, event or exercise. It belongs to one or more departments and has a ladder of named levels (one by default), optional groups of teams named by the instance's group label (such as "Client" or "Company"), teams, and a register of outside people such as client staff.
- Anyone holding `team_instances.view` or `team_instances.manage` over one of its departments sees an instance: its teams, who is on them, progression, the roster and the latest 30 changes. Members and directors see every instance; advisory members see none.
- Running an instance (groups, teams, outside people, placements, team levels and status) needs `team_instances.manage` over any one of its departments. Changing its settings, departments or ladder, or deleting it, needs that grant over all of them, so one department cannot reshape or remove a joint instance. Admins hold the grant globally and directors for their own department. Titles never grant these rights.
- Only people with portal access that includes viewing the instance can be placed, so never advisory members, invited people or alumni. A department-scoped manager places only people from their own departments. Outside people belong to one instance; an email, when given, is unique within it ignoring case and is shown only to the people who run the instance.
- Someone may be on several teams of the same instance. A team's minimum only flags it as short. Its maximum counts members and outside people together, refuses placements once reached even when they arrive at the same moment, and cannot be lowered below who is on the team. A move adds someone to the new team and removes them from the old one together.
- Staff move teams through the ladder one level at a time and can eliminate, crown or reinstate them; nothing advances automatically. Shortening the ladder moves teams above it to the new last level. Deleting a group keeps its teams, deleting a team keeps its outside people in the register, and deleting an instance removes everything in it except its audit trail.
- Every change is audited under the instance (`team_instance.*`) with names and values but never emails, so all viewers can read the activity feed.
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
