# API Contract — 180DC VIT Chennai Platform

This document describes the public and authenticated surface of `admin-api.technical-vitc.workers.dev`. All routes are served by `apps/admin-api/index.ts`.

## Conventions

- **Auth:**
  - `public` — no token required.
  - `token` — requires a valid `Authorization: Bearer <token>` header.
  - `member` — `power_level >= 10`.
  - `director` — `power_level >= 50`.
  - `board` — `power_level >= 100`.
  - `newsletter` — requires a valid newsletter editor session token (OTP based).
- **Response shape:** `{ success: true, ... }` on success; `{ error: "..." }` on failure.
- **Rate limiting:** Most endpoints have per-IP rate limits. See `checkRateLimit` in `apps/admin-api/index.ts`.
- **Email delivery:** All email goes through the `sendEmail()` choke-point: Spacemail SMTP (`mail.spacemail.com:465`, implicit TLS) is the only email provider; there is no fallback. Session-level temporary failures (timeouts, dropped connections, 4xx before RCPT) leave recipients queued for the next cron run; a rejected recipient (any RCPT error) or a permanent session failure (5xx) marks that recipient failed. A Spacemail "too many messages" rejection marks the current hour as used up so the queue waits for the next hour. Every send is one recipient per message. SMTP is capped at 500 messages/hour (`email_hour_count`), of which the queue uses at most 90% so OTP and login-token mail always has room. Bulk sends insert an `email_queue` campaign and return `queued`/`total`; the `* * * * *` cron delivers it at up to 15 messages/minute. Newsletter tables live in `NEWSLETTER_DB`.

## Public routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/content/case-studies` | public | Public case study listing. |
| GET | `/api/content/team-members` | public | Leadership team page data. |
| GET | `/api/content/partners` | public | Partners list. |
| POST | `/api/newsletter/subscribe` | public | Subscribe to newsletter. |
| GET | `/api/newsletter/unsubscribe` | public | Legacy unsubscribe by `?email=` (links in emails sent before per-subscriber tokens). |
| POST | `/api/newsletter/unsubscribe/:token` | public, CSRF-exempt | Unsubscribe by the subscriber's `unsubscribe_token`. Called by the `/unsubscribe/:token` page and by mail clients' RFC 8058 one-click `List-Unsubscribe-Post`. Returns `status` (`unsubscribed` / `already` / `not_found`) and `email`. |
| GET | `/api/newsletter/subscribers/count` | public | Active subscriber count. |
| GET | `/api/newsletter` | public | Public newsletter archive — sent (published) issues only. |
| GET | `/api/newsletter/:id` | public | Single newsletter with sanitized `content` (fetched by the separate newsletter site). |
| POST | `/api/newsletter-editor/otp/send` | public | Request OTP for newsletter editor. |
| POST | `/api/newsletter-editor/otp/verify` | public | Verify OTP and get session token. |
| POST | `/api/signup-requests` | public | Submit a member account request. |
| POST | `/api/consulting-request` | public | Submit a consulting request. |
| POST | `/api/dev-login` | public | Log in with admin token (dev only; 403 when `ENVIRONMENT=production`). Creates user if missing. |
| POST | `/api/auth/token-login` | public | Production-safe token login. Validates admin token against `admin_tokens`; creates user if missing. |
| POST | `/api/auth/clerk-login` | public | Log in with a Clerk JWT (Google OAuth). Email is resolved from the Clerk Backend API; request-body email is only used if Clerk-verified. 401 when the JWT is invalid/expired or the account cannot be mapped; 409 when the Clerk user is already linked to another member. |
| POST | `/api/auth/forgot-token` | public | Email token to member (always returns success). |
| GET | `/api/departments` | public | Department list (name, description). |
| GET | `/api/projects/completed` | public | Completed projects (R2 cache, fallback to DB). |
| GET | `/api/case-studies/images/*` | public | Serve a case-study or newsletter source image/file. |
| GET | `/api/admin/maintenance` | public | Check maintenance mode status. |

## Auth routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/link-clerk` | token | Link the Clerk user ID from a verified `clerkToken` JWT to the member. |
| POST | `/api/auth/unlink-clerk` | token | Unlink Clerk user ID. |
| POST | `/api/auth/rotate-token` | token | Revoke current token and email a new one. |

## Dashboard

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/dashboard` | token | Dashboard stats, user flags, pending requests, recent meets, announcements, admin tokens, role transfers. |

## Admin tokens

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/admin-tokens` | board | Create a token for an email and role. |
| DELETE | `/api/admin-tokens/:email` | board | Delete token by email. |
| POST | `/api/admin-tokens/:email/revoke` | board | Revoke token by email. |

## Members, board users, and advisory

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/members` | board | Add a general member. |
| POST | `/api/board-users` | board | Create or update a board/director user and issue token. |
| POST | `/api/advisory-members` | board | Create or update an advisory member and issue token. |
| PUT | `/api/members/:id/role` | board | Change a member's role, department, and ex title. |
| DELETE | `/api/members/:id` | board | Remove a member (cannot remove board members). |

## Users and roles

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/users` | director | List users. Board sees all; directors see own department. |
| GET | `/api/members/export` | board | Export all members as CSV. |
| GET | `/api/members-directory` | member | Member directory with role/department. |
| POST | `/api/roles` | board | Create a custom role with `power_level < 100`. |
| GET | `/api/roles` | board | List roles. |

## Role transfers

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/role-transfers` | board | List pending role transfers. |
| POST | `/api/role-transfers` | board | Create a role transfer request. |
| POST | `/api/role-transfers/:id/approve` | board | Approve and execute a role transfer. |
| POST | `/api/role-transfers/:id/reject` | board | Reject a role transfer. |
| GET | `/api/my-role-transfers` | token | List pending transfers involving the current user. |
| POST | `/api/my-role-transfers/:id/accept` | token | Accept a role transfer as from/to user. |
| POST | `/api/my-role-transfers/:id/decline` | token | Decline a role transfer. |

## Signup requests

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/signup-requests` | public | Submit a public signup request. |
| GET | `/api/signup-requests` | board | List pending signup requests. |
| POST | `/api/signup-requests/:id/approve` | board | Approve and create user + token. |
| POST | `/api/signup-requests/:id/reject` | board | Reject a signup request. |

## Departments

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/departments` | public | List all departments. |
| GET | `/api/departments/:id/overview` | director | Department meets, documents, instructions, and projects. |
| GET | `/api/departments/:id/members` | director | Members of a department. |
| GET | `/api/departments/:id/instructions` | director | Department instructions. |

## Department meets

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/department-meets` | member | List department meets (board sees all; others see own department). |
| POST | `/api/departments/:id/meets` | director | Schedule a department meet and notify members. |
| DELETE | `/api/departments/:id/meets/:meetId` | director | Delete a department meet. |

## Club-wide meets

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/club-meets` | member | List club-wide meets. |
| POST | `/api/club-meets` | director | Schedule a club-wide meet and notify members. |
| DELETE | `/api/club-meets/:id` | director | Delete a club-wide meet. |

## Inter-department meets

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/inter-dept-meets` | member | List inter-department meets. |
| POST | `/api/inter-dept-meets` | director | Schedule an inter-department meet and notify members. |
| DELETE | `/api/inter-dept-meets/:id` | director | Delete an inter-department meet. |

## Meet notifications

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/meets/:type/:id/send-notification` | director | Meet email for an existing meet (Spacemail SMTP). |
| POST | `/api/meets/process-queue` | board | Send pending meet emails up to the hourly SMTP cap. |

## Department panel content

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/departments/:id/documents` | director | Add a document to a department. |
| DELETE | `/api/departments/:id/documents/:docId` | director | Delete a department document. |
| POST | `/api/departments/:id/instructions` | director | Add a department instruction. |
| DELETE | `/api/departments/:id/instructions/:instructionId` | director | Delete a department instruction. |
| POST | `/api/departments/:id/projects` | director | Add a department project. |
| PUT | `/api/departments/:id/projects/:projectId/status` | director | Update department project status. |

## Global projects

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/projects` | member | List global projects (filtered for directors). |
| POST | `/api/projects` | board | Create a global project. |
| DELETE | `/api/projects/:id` | board | Delete a project and related data. |
| POST | `/api/projects/:id/complete` | board | Mark project complete and regenerate R2 cache. |
| POST | `/api/projects/:id/reopen` | board | Reopen project and regenerate R2 cache. |
| POST | `/api/projects/regenerate-completed` | board | Manually regenerate completed projects JSON. |
| GET | `/api/projects/completed` | public | Completed projects list. |

## Project roles

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/projects/:id/roles` | director | Assign a member to a project with a role name. |
| DELETE | `/api/projects/:id/roles/:roleId` | director | Remove a project role. |

## Project tasks

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/projects/:id/tasks` | member | List tasks for a project. |
| POST | `/api/projects/:id/tasks` | director | Create a project task. |
| PUT | `/api/projects/:id/tasks/:taskId` | director | Mark a task pending or completed. |
| POST | `/api/projects/:id/tasks/complete-all` | director | Mark all pending tasks completed. |

## Team instances

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/team-instances` | member | List instances (advisory excluded). |
| POST | `/api/team-instances` | director | Create an instance. |
| PUT | `/api/team-instances/:id` | director | Update instance name/description. |
| DELETE | `/api/team-instances/:id` | director | Delete instance and all teams/members. |

## Team instance teams

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/team-instances/:id/teams` | director | Create a team with optional min/max members and initial members. |
| PUT | `/api/team-instances/:id/teams/:teamId` | director | Update team name/description/limits. |
| DELETE | `/api/team-instances/:id/teams/:teamId` | director | Delete a team. |
| POST | `/api/team-instances/:id/teams/:teamId/members` | director | Add a member to a team. |
| DELETE | `/api/team-instances/:id/teams/:teamId/members/:userId` | director | Remove a member from a team. |

## Case studies

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/case-studies` | member | List case studies. |
| POST | `/api/case-studies` | member | Create a case study. |
| PUT | `/api/case-studies/:id` | member | Edit a case study. |
| DELETE | `/api/case-studies/:id` | director | Delete a case study and remove R2 objects. |
| POST | `/api/case-studies/upload-image` | member | Upload a case-study image. |
| POST | `/api/case-studies/upload-document` | member | Extract text and suggested title/description from a PDF/DOCX. |
| POST | `/api/case-studies/upload-source` | member | Upload a source PDF/DOCX to R2 and return a public URL. |
| DELETE | `/api/case-studies/delete-image` | member | Delete an uploaded image or source file by R2 key. |
| GET | `/api/case-studies/images/*` | public | Serve image or source file from `CASE_STUDIES`. |

## Consulting requests

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/consulting-request` | public | Submit a consulting request. |
| GET | `/api/consulting-requests` | board | List all consulting requests. |
| POST | `/api/consulting-requests/:id/accept` | board | Accept and send custom email. |
| POST | `/api/consulting-requests/:id/reject` | board | Reject and send custom email. |
| DELETE | `/api/consulting-requests/:id` | board | Delete a consulting request. |

## Send email

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/send-email` | director | Send arbitrary email to members; directors limited to own department. Up to 10 recipients send synchronously (one message each); larger lists enqueue a `custom` campaign delivered by the queue. |

## Club files

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/club-files` | member | List and filter club files. |
| GET | `/api/club-files/events` | member | Unique event names for filter. |
| GET | `/api/club-files/projects` | member | Unique project names for filter. |
| POST | `/api/club-files/upload` | director | Upload a file to R2. |
| DELETE | `/api/club-files/:id` | director | Delete a club file. |
| GET | `/api/club-files/:id/download` | member | Download a club file. |

## Announcements

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/announcements` | member | List announcements. |
| POST | `/api/announcements` | board | Create an announcement. |
| DELETE | `/api/announcements/:id` | board | Delete an announcement. |

## Maintenance

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/admin/maintenance` | public | Get maintenance status. |
| POST | `/api/admin/maintenance` | board | Toggle maintenance mode. |
| GET | `/api/admin/email-queue` | board | Email queue stats: hourly usage and recent campaigns. |
| GET | `/api/admin/email-queue/:id/deliveries` | board | One campaign plus its per-recipient `email_deliveries` rows (`sent` / `failed` / `skipped`, error, attempts). |
| POST | `/api/admin/email-queue/:id/retry-failed` | board | Re-queues a finished campaign; recipients already `sent`/`skipped` are not re-sent. Refused for campaigns that predate delivery tracking. |

## Newsletter editor (OTP session)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/newsletter-editor/logout` | newsletter | Delete newsletter session. |
| GET | `/api/newsletter-editor/me` | newsletter | Get session email. |
| GET | `/api/newsletter-editor/drafts` | newsletter | List editor's drafts. |
| POST | `/api/newsletter-editor/drafts` | newsletter | Create or update a draft. |
| DELETE | `/api/newsletter-editor/drafts/:id` | newsletter | Delete own draft. |
| POST | `/api/newsletter-editor/upload-source` | newsletter | Upload source file. |
| POST | `/api/newsletter-editor/send` | newsletter | Enqueue a draft for active subscribers (returns `queued`/`total`). |
| POST | `/api/newsletter-editor/send-event` | newsletter | Enqueue event mail for active subscribers. |
| GET | `/api/newsletter-editor/admin/authorized-emails` | board | List authorized emails. |
| POST | `/api/newsletter-editor/admin/authorized-emails` | board | Add authorized email. |
| DELETE | `/api/newsletter-editor/admin/authorized-emails/:email` | board | Remove authorized email. |

## Newsletter admin (board)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/newsletter/admin` | board | List all newsletters. |
| GET | `/api/newsletter/admin/subscribers` | board | List subscribers. |
| POST | `/api/newsletter` | board | Create or update a newsletter. |
| DELETE | `/api/newsletter/:id` | board | Delete a newsletter. |
| POST | `/api/newsletter/send` | board | Enqueue newsletter to subscribers (returns `queued`/`total`). |
| POST | `/api/newsletter/upload-source` | board | Upload newsletter source file. |

## Letter Studio (OTP session)

The Letter Studio at `/letters` is the official letterhead generator (appointment, promotion, termination, transfer, resignation, show-cause, service, relieving, recognition, MOU, announcement, department report, LDI). Access is OTP-based; only emails in `letter_authorized_emails` can request an OTP.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/letter-studio/otp/send` | letter session | Send OTP to an authorized email. |
| POST | `/api/letter-studio/otp/verify` | letter session | Verify OTP, issue 24h session token. |
| POST | `/api/letter-studio/logout` | letter session | Delete letter session. |
| GET | `/api/letter-studio/me` | letter session | Get session email. |
| POST | `/api/letter-studio/upload` | letter session | Upload generated letter PDF to R2 `letters/` folder. |
| POST | `/api/letter-studio/send` | letter session | Send the letter PDF with a standard per-type mail through `sendEmail()` (Spacemail SMTP). Respects rate limits and SMTP hourly cap. Logs to `letters_sent`. |
| GET | `/api/letter-studio/members` | letter session | Member directory (name, email, role, department) for the recipient picker. Excludes advisory members. |
| GET | `/api/letter-studio/files/*` | letter session (via `?t=` token) | Download a stored letter PDF. |
| GET | `/api/letter-studio/admin/authorized-emails` | board | List authorized emails. |
| POST | `/api/letter-studio/admin/authorized-emails` | board | Add authorized email. |
| DELETE | `/api/letter-studio/admin/authorized-emails/:email` | board | Remove authorized email. |

Standard mail subjects/bodies are generated server-side per document type (`letterEmailSubject` / `letterEmailHtml`) with the PDF attached from R2. Generated PDFs are produced client-side (html2canvas + jsPDF) in `apps/frontend/src/pages/letters/`.

## Implementation notes

- All `director` endpoints assume `power_level >= 50` and, where department scoping applies, the user's `department_id` matches the resource.
- `member` means any authenticated user with `power_level >= 10`. Some endpoints have additional logic (e.g., advisory members cannot access team instances).
- `token` means the route requires authentication but does not itself enforce a minimum power level beyond being a valid user.
- `public` routes still pass through `isPublicRoute` and may be rate-limited.
- The frontend always calls `/api/*` and relies on `apps/frontend/functions/_middleware.ts` to proxy to the `admin-api` Worker.
- CORS is enabled for `https://newsletter.180dcvitc.org` (the separate newsletter site, ADR-004) plus the existing `180dcvitc.org` origins. CORS/CSRF allowlists live in `apps/admin-api/index.ts` (`ALLOWED_ORIGINS`).
