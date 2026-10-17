# Product Specification — 180DC VIT Chennai Platform

## Scope

This is the internal admin and public website for 180 Degrees Consulting, VIT Chennai. It is a student-run consulting club management platform that is also the public face of the club.

## Actors

| Actor | Description | Identifier in code |
|-------|-------------|--------------------|
| Public visitor | Anyone on the internet; no login. | No token / public routes only. |
| Subscriber | Public visitor who opts in to newsletters by confirming an emailed link. | Stored in `newsletter_subscribers`. |
| General member | Logged-in club member, power level 10. | `users` row with role `member` or similar. |
| Director / lead | Member with a department assignment and power level 50. | `users.role_id` with `roles.power_level = 50`. |
| Board member | President/VP/Secretary/Co-Secretary/Technical Director, power level 100. | `users.role_id` with `roles.power_level = 100`. |
| Advisory member | External advisor, power level 30. | `users.role_id = 'advisory'`. |
| Newsletter editor | Authorized non-member or member who uses the OTP-based newsletter editor. | `newsletter_authorized_emails` or member with `power_level != 30`. |

## Capabilities

### CAP-PUBLIC-01 Public landing website

The public site at `180dcvitc.org` shows:

- Splash/hero section.
- About section with animated counters.
- Global 180DC chapter network (3D globe).
- Leadership team (organization chart).
- Case studies.
- Completed projects.
- Partners.
- Footer with contact and consulting request form.

### CAP-PUBLIC-02 Newsletter subscription

Public visitors can subscribe, unsubscribe, and view the public subscriber count. Subscribers are stored in `newsletter_subscribers`. Every email links to a personal `/unsubscribe/<token>` page that unsubscribes on open; mail clients can also unsubscribe in one click via the `List-Unsubscribe` header.

### CAP-PUBLIC-03 Consulting request

Public visitors and organizations can submit a consulting request. Board members can accept or reject with a custom email.

### CAP-PUBLIC-04 Account request

Public visitors can request a member account. Board members approve or reject, which creates a user and a token.

### CAP-AUTH-01 Token-based member login

Members log in with a token sent to their email or with a token shown by a board member. The token is a long random UUID stored in `admin_tokens`.

### CAP-AUTH-02 Google sign-in

Members can link a Google account from Profile. After linking, they can sign in with Google. The Worker runs the Google OAuth flow itself and issues the same expiring session as token sign-in; Google sign-in never creates or restores a registry token.

### CAP-AUTH-03 Forgot token

Members can request their token be emailed to them. The endpoint always returns success to prevent email enumeration.

### CAP-MEMBER-01 Member directory

Logged-in members can view all members, search, and filter by role. Board can export CSV.

### CAP-MEMBER-02 Profile management

Members can view their token, rotate it, link/unlink Google, and see their role/department.

### CAP-ROLE-01 Role and department management

Board can create custom roles with power levels below 100, create departments, and assign members to roles/departments.

### CAP-ROLE-02 Role transfers

Board can initiate role transfers between members. Both parties must accept, and board roles cannot be transferred.

### CAP-PROJECT-01 Global project management

Board creates global projects with name, company, year, deadline, description, and assigned departments. Directors can view projects for their department. Board can mark projects complete, which regenerates a static JSON in R2.

### CAP-PROJECT-02 Project tasks

Directors and board can create, complete, and manage tasks within a project.

### CAP-PROJECT-03 Project roles

Directors and board can assign members to a project with a custom role name.

### CAP-DEPT-01 Department panel

Each department has meets, documents, instructions, and department-only projects. Directors can manage their own department; board can manage any.

### CAP-MEET-01 Club-wide, department, and inter-department meets

Board and directors can schedule meets with title, time, description, and meet link. Members see meets relevant to them. Meet links are hidden 24 hours after the scheduled time.

### CAP-MEET-02 Meet email notifications

When a meet is created, the system emails eligible members. If the daily 100-email quota is exceeded, emails are written to `pending_emails` and can be processed later.

### CAP-FILE-01 Club files

Leads and above can upload files to R2 under `general`, `events`, or `projects` categories. All members can view and download. Files use R2 custom metadata for indexing.

### CAP-CASE-01 Case studies

Members can create, edit, and delete case studies with rich HTML content, images, and source files. No approval workflow.

### CAP-NEWS-01 Newsletter editor (OTP-based)

Authorized emails can log in via OTP to create drafts, upload PDF/DOCX source, and send newsletters or event emails to all active subscribers.

### CAP-NEWS-02 Newsletter administration

Board can manage the list of authorized newsletter editor emails and send newsletters from the members portal.

### CAP-ANN-01 Announcements

Board can post and delete announcements. All members see them.

### CAP-MAINT-01 Maintenance mode

Board can enable maintenance mode, which blocks all non-board members with a custom message.

### CAP-TEAM-01 Team instances

Directors and board can create "instances" (events, case competitions, applications) and split them into teams with optional member limits and minimums. Advisory members cannot access.

## Current vs target scope

| Capability | Status on `main` | Notes |
|------------|------------------|-------|
| Public landing website | Implemented in `apps/frontend`. | |
| Newsletter subscription | Implemented. | |
| Consulting requests | Implemented. | |
| Account requests | Implemented. | |
| Token/Google auth | Implemented. | |
| Member directory and profiles | Implemented. | |
| Roles and departments | Implemented. | |
| Role transfers | Implemented. | |
| Projects and tasks | Implemented. | |
| Department panels | Implemented. | |
| Meets and notifications | Implemented. | |
| Club files | Implemented. | |
| Case studies | Implemented. | |
| Newsletter editor | Implemented. | |
| Announcements | Implemented. | |
| Maintenance mode | Implemented. | |
| Team instances | Implemented. | Added in latest `main`. |
| Public API split | Not implemented. | `apps/public-api/index.ts` is a placeholder. |
| Queue-based job processor | Not implemented. | `apps/job-processor/index.ts` is a placeholder. |
| Amazon SES bulk email | Not implemented. Superseded by the Spacemail SMTP migration (`docs/operations/SPACEMAIL_SETUP.md`); Spacemail is the only provider. |
| Recruitment system | Removed. | Tables are dropped by `runMigrations`. |
| Real-time chat | Partially present in `docs/product/REPORT.md` but no code found in `main`. | Treat as not implemented. |
| AI chatbot (ConsultAI) | Partially present in `docs/product/REPORT.md` but no code found in `main`. | Treat as not implemented. |

## Non-goals on `main`

- Adding a separate recruitment system.
- Rebuilding the frontend on Next.js or moving to Cloudflare Access (per `docs/architecture/backend-architecture-cloudflare.txt`, which is historical).
- Replacing the custom token auth with a third-party auth provider for the members portal.
- Implementing real-time chat or AI chatbot without an explicit new plan.
# Reimagined incremental capabilities

Members can complete and reopen their own assigned global-project tasks through the members portal. The server supplies task update permissions and enforces them independently. Task load/update failures are visible and refreshable. Project directories and dashboard counts use the same board/department/explicit-role access policy as direct task reads. The remaining unified product roadmap is in `docs/execution/unified-platform-plan.md`.

Member token sign-in now works in production and creates a separate seven-day session. Profile lists that member's current sessions, their expiry and a sign-out action. Signing out a selected session leaves other devices signed in; revoking/rotating the account token invalidates its sessions. Device credentials are hidden in the ordinary profile. Web Google sign-in exchanges the existing provider login result into a device session; live provider and browser acceptance testing remains required.

Google sign-in now requires a member's explicit Profile link backed by a verified provider session. First-time users sign in with their member token and link Google; entering a member's email cannot select that identity. Unlink disables subsequent Google login. Member access revocation/expiry also blocks Google login. Live redirect/browser acceptance remains pending on personal staging.

Club Files now exposes only its approved shared General/Projects/Events library. Private and Letter Studio objects cannot be reached through shared list/download/delete, including by a guessed ID. Contextual attachments that follow project/task/meeting permissions remain planned work.

The members home now starts with Today: open assigned tasks, labeled project deadlines, task completion, relevant meetings in the next seven days, incoming role invitations and board account approvals. It displays freshness and error/loading states and links to existing work/review sections. Individual task due dates, blocked work, unread updates, mentions and Recent activity remain planned extensions. Today desktop/mobile component interaction and visual checks passed with synthetic mocked responses; complete portal/staging acceptance remains pending.

An initial Android member client now exists in `apps/mobile`: token/device-session sign-in, SecureStore credential persistence, Today reads, owned-task completion, HTTPS meeting links, foreground refresh and local/remote logout attempts. Native type/transport/bundle checks passed; device acceptance, full workflow parity, Google/native guest access, push and signed distribution remain pending. See the mobile capability matrix.

The initial Android member client includes a native device-session list and confirmed device sign-out, using the same owned-session backend as the web profile. Revoking the current app clears local access. Native device acceptance and wider profile/workspace parity remain pending.

Project tasks support task-specific due dates and low/normal/high/urgent priority. Authorised project leads create and edit schedules in the web task list; web and Android Today display these fields on the same assigned task records. This does not yet implement task boards, reassignment, blockers, dependencies or native schedule editing.

The web task-details editor now edits owner, due date and priority in a single save, including unassignment. It detects stale edits and offers reload. Web and Android Today consume the updated owner-scoped task record; native lead editing is still pending.

Task rows now expose a scoped, paginated history view for recorded creation, completion/reopening, owner and scheduling changes, showing actors and before/after values. Earlier unrecorded actions are not reconstructed. Native history, comments and broader collaboration remain pending.

## Void portal (`apps/portal`)

The Void rewrite (ADR-007) runs as a separate deployment until the cutover. Shipped so far: Google-only invite sign-in and the personnel system (directory, profiles, lifecycle, positions and terms, access roles, CSV import and export, audit log); the public site and content administration; club files and the gallery; department workspaces; the email queue sending through Cloudflare Email Sending (ADR-008); Meets, where club-wide, department and inter-department meetings are scheduled with emailed announcements and each link disappears a day after the meet; and Projects, where client projects get their departments, the people on them and their tasks, and completed projects are listed on the public site.

The portal now opens on Today: open assigned tasks, relevant meets in the next seven days, recent announcements and permission-scoped attention counts. Project readers can open each task's Comments/History panel, post plain-text comments, remove their own comments (task managers may moderate), and page through recorded changes.

Team instances (`/teams`) run competitions, events and exercises where people are split into teams. Directors and admins set up the levels, group teams by client or company, register outside participants, and place members on teams with size limits; each instance has Staffing, Progression (advance, eliminate, crown a winner), Roster and Activity views. Members can view instances; advisory members cannot.
