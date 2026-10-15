# Business Logic — 180DC VIT Chennai Platform

This document describes the system from the domain perspective. Each section covers a capability, its actors, rules, and state changes.

## Authentication and sessions

### Actors
- Public visitor.
- Member with a token.
- Member with Clerk Google OAuth.

### Workflows

#### Token login (RULE-AUTH-01)

1. User provides a token at `/members`.
2. Frontend posts `POST /api/dev-login`.
3. Backend validates the token against `admin_tokens`.
4. If the token is not revoked and not expired, the user is looked up by email in `users`.
5. If no user exists, the backend auto-creates a user from the token's `email`, `name`, and `role_id`.
6. The response includes `email`, `name`, `roleId`, `roleName`, `powerLevel`, and `departmentId`.
7. Frontend stores the token and profile in `sessionStorage` and `localStorage`.

#### Clerk Google login (RULE-AUTH-02)

1. User clicks Google sign-in; Clerk handles OAuth.
2. Frontend gets a Clerk JWT via `getToken()`.
3. Frontend posts `POST /api/auth/clerk-login` with the JWT.
4. Backend verifies the JWT with `CLERK_SECRET_KEY`.
5. Backend fetches the Clerk user via the Clerk Backend API and accepts only Clerk-verified email addresses. Client-supplied emails are never trusted.
6. Backend looks up the user by `clerk_user_id` (the stored link must match a verified email on the Clerk account) or, if unlinked, by a Clerk-verified email (auto-link). A Clerk user ID already linked to another member is rejected.
7. If `oauth_enabled = 0`, login fails.
8. A token is created or reused in `admin_tokens`.
9. Frontend uses that token for subsequent requests.

#### Token login (RULE-AUTH-06)

1. Member enters the token received by email on the login page.
2. Frontend posts `POST /api/auth/token-login` with the token.
3. Backend validates it against `admin_tokens` (must be unrevoked and unexpired); invalid tokens receive 401.
4. If no `users` row exists yet, one is created from the token's email/name/role.
5. The response includes `email`, `name`, `roleId`, `roleName`, `powerLevel`, and `departmentId`.
6. The legacy `/api/dev-login` route is for development only and returns 403 when `ENVIRONMENT=production`.

#### Token rotation (RULE-AUTH-03)

- Any authenticated member can rotate their own token via `POST /api/auth/rotate-token`.
- The old token is deleted; a new token is generated and emailed.

#### Link/unlink Clerk (RULE-AUTH-04)

- Authenticated members can link a Clerk account via `POST /api/auth/link-clerk` by presenting a valid Clerk JWT (`clerkToken`). The server links the JWT's verified `sub`; client-supplied Clerk user IDs are not accepted.
- They can unlink via `POST /api/auth/unlink-clerk`.

### Business rules

- RULE-AUTH-01: A token must be unrevoked and unexpired to log in.
- RULE-AUTH-02: Google login only works if the Clerk JWT is valid, the Clerk account has a verified email matching the member, and the member has `oauth_enabled = 1`.
- RULE-AUTH-03: Tokens are deleted and regenerated on rotation, not stored hashed.
- RULE-AUTH-04: The `forgot-token` endpoint always returns success to prevent email enumeration.
- RULE-AUTH-05: Maintenance mode blocks all members with `power_level < 100`.
- RULE-AUTH-06: Token login via `/api/auth/token-login` works in production; `dev-login` does not.

## Roles and permissions

### Actors
- System (seeded roles).
- Board member (`power_level >= 100`).
- Director (`power_level = 50`).
- General member (`power_level = 10`).
- Advisory member (`power_level = 30`).

### State

- `roles(id, name, power_level, created_by)`.
- `users(id, name, email, role_id, department_id, secondary_role_id, ex_title, clerk_user_id, oauth_enabled, created_at)`.

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

- RULE-NEWS-01: Public visitors can subscribe via `POST /api/newsletter/subscribe`.
- RULE-NEWS-02: Every subscriber has a random `unsubscribe_token`. Newsletter, event, and welcome emails link to `https://180dcvitc.org/unsubscribe/<token>` and carry `List-Unsubscribe: <https://180dcvitc.org/api/newsletter/unsubscribe/<token>>` with `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. Unsubscribing is a POST (`/api/newsletter/unsubscribe/:token`) so link-prefetching scanners cannot trigger it. The legacy `GET /api/newsletter/unsubscribe?email=...` stays for links in older emails.
- RULE-NEWS-03: The system stores `active`, `subscribed_at`, and `unsubscribed_at` in `newsletter_subscribers` in `NEWSLETTER_DB`. Subscribing sends a welcome email (re-subscribing sends a welcome-back email) synchronously; delivery failures are logged.
- RULE-NEWS-03a: `GET /api/newsletter/:id` is public, rate-limited, and serves newsletter `content` only after sanitization (`sanitizeBlogHtml`) — never raw stored HTML. The separate newsletter site (ADR-004) fetches this endpoint.
- RULE-NEWS-03b: The bulk-email CTA uses `NEWSLETTER_SITE_URL` when set (CTA → `{site}/newsletter/{id}`) and otherwise falls back to `https://180dcvitc.org/#newsletter`. The production var is intentionally empty until the separate newsletter site (ADR-004) is deployed. Bulk templates render the `%%UNSUBSCRIBE_URL%%` marker, which the queue drain replaces per recipient.

### Newsletter editor (OTP)

- RULE-NEWS-04: Access requires an email in `newsletter_authorized_emails` or a registered member with `power_level != 30`.
- RULE-NEWS-05: A 6-digit OTP is emailed and expires in 5 minutes.
- RULE-NEWS-06: A successful OTP verification creates a 24-hour session in `newsletter_sessions`.
- RULE-NEWS-07: Editors can create drafts, upload source files, and send newsletters or event emails.
- RULE-NEWS-08: Bulk sends insert one `email_queue` campaign and return `queued`/`total` immediately; the cron sends one personalized message per subscriber (1.5 s apart, within the 500-messages/hour Spacemail cap), skips subscribers who unsubscribed after the campaign was queued (except test sends), records each outcome in `email_deliveries`, and updates `recipient_count` on completion. Board members can retry only the failed recipients via `POST /api/admin/email-queue/:id/retry-failed`.
- RULE-NEWS-09: Source files are stored in `CASE_STUDIES` R2.

### Board newsletter management

- RULE-NEWS-10: Board can create, update, delete, and send newsletters from the members portal.
- RULE-NEWS-11: Board can manage authorized newsletter editor emails.

## Consulting requests

### Business rules

- RULE-CONSULT-01: Public visitors can submit a consulting request.
- RULE-CONSULT-02: Board can list, accept, reject, and delete requests.
- RULE-CONSULT-03: Accept/reject sends a custom email through the unified email path (Spacemail SMTP with Resend fallback).
- RULE-CONSULT-04: A request can only be accepted or rejected once.

## Announcements

### Business rules

- RULE-ANN-01: Board can create and delete announcements.
- RULE-ANN-02: Title and content are stripped of HTML tags.
- RULE-ANN-03: All members can view announcements.

## Maintenance mode

### Business rules

- RULE-MAINT-01: Board can enable/disable maintenance mode.
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

- RULE-RATE-01: Most endpoints are rate-limited per IP and endpoint in the `rate_limits` table.
- RULE-RATE-02: Login endpoints use a separate `checkLoginRateLimit` that resets on success.
- RULE-QUOTA-01: All outbound email goes through `sendEmail()`: Spacemail SMTP (`mail.spacemail.com:465`) is primary and Resend is the automatic fallback when SMTP fails.
- RULE-QUOTA-02: No send uses BCC batching; every queued campaign (newsletter, event, meet, Send Mail) and every direct send is one recipient per message. SMTP sends are capped at 500 messages/hour in `email_hour_count` and drained with adaptive pacing (up to 15 messages/minute) by the `* * * * *` cron.
- RULE-QUOTA-03: The Resend fallback is capped at 100 recipients/day in `resend_daily_count`.
- RULE-QUOTA-04: Bulk sends (newsletter, event, meet, and Send Mail lists over 10 recipients) insert an `email_queue` campaign and return `queued`/`total`; the cron carries the campaign to completion, pacing adaptively up to the 500/hour cap, and retries up to 5 times. Send Mail lists of 10 or fewer are sent synchronously (one message per recipient).
- RULE-QUOTA-05: Sends with no email provider configured fail without calling any provider; OTP and letter sends return 500.
- RULE-QUOTA-06: Newsletter data lives in the separate `NEWSLETTER_DB`; the cron writes campaign completion (`sent_at`, `recipient_count`) back to `newsletters` there.

## Audit logging

### Business rules

- RULE-AUDIT-01: Significant actions write a row to `audit_log`.
- RULE-AUDIT-02: Audit log entries are append-only.
