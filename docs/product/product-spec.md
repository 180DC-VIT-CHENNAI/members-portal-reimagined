# Product Specification — 180DC VIT Chennai Platform

## Scope

This is the internal admin and public website for 180 Degrees Consulting, VIT Chennai. It is a student-run consulting club management platform that is also the public face of the club.

## Actors

| Actor | Description | Identifier in code |
|-------|-------------|--------------------|
| Public visitor | Anyone on the internet; no login. | No token / public routes only. |
| Subscriber | Public visitor who opts in to newsletters. | Stored in `newsletter_subscribers`. |
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

### CAP-AUTH-02 Google login via Clerk

Members can link a Google (Clerk) account. After linking, they can sign in with Google. The backend verifies the Clerk JWT and creates or reuses an `admin_tokens` row.

### CAP-AUTH-03 Forgot token

Members can request their token be emailed to them. The endpoint always returns success to prevent email enumeration.

### CAP-MEMBER-01 Member directory

Logged-in members can view all members, search, and filter by role. Board can export CSV.

### CAP-MEMBER-02 Profile management

Members can view their token, rotate it, link/unlink Clerk, and see their role/department.

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
| Token/Clerk auth | Implemented. | |
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
| Amazon SES bulk email | Not implemented. Superseded by the Spacemail SMTP migration (`docs/operations/SPACEMAIL_SETUP.md`); Resend remains an automatic fallback. |
| Recruitment system | Removed. | Tables are dropped by `runMigrations`. |
| Real-time chat | Partially present in `docs/product/REPORT.md` but no code found in `main`. | Treat as not implemented. |
| AI chatbot (ConsultAI) | Partially present in `docs/product/REPORT.md` but no code found in `main`. | Treat as not implemented. |

## Non-goals on `main`

- Adding a separate recruitment system.
- Rebuilding the frontend on Next.js or moving to Cloudflare Access (per `docs/architecture/backend-architecture-cloudflare.txt`, which is historical).
- Replacing the custom token auth with Clerk for the members portal.
- Implementing real-time chat or AI chatbot without an explicit new plan.
