# Portal port plan (admin-api → Void portal)

Status: in progress. The decision behind this is [ADR-007](../architecture/decisions/007-void-portal-rewrite.md). Production (`180dc.vitcc.org`) stays on the old `members-portal-reimagined` Worker until the cutover (slice 10).

Each slice below is one PR to `origin/main` and must include:
- a Drizzle schema change and a generated migration;
- `routes/api/**` handlers behind `requirePermission`;
- e2e tests in `apps/portal/tests/e2e`;
- UI pages;
- docs.

The old Worker's 165 routes and 52 tables map onto the slices like this.

## Not ported (replaced by the personnel system, PRs #14–#18)

| Old area | Replacement |
|---|---|
| `admin_tokens`, `member_sessions`, `/api/auth/session`, `rotate-token`, `forgot-token`, `dev-login`, `oauth_states`, `oauth_handoffs` | Better Auth, Google only, invite-gated (`auth.ts`, `src/server/signin.ts`) |
| `users`, `roles`, `/api/members*`, `/api/board-users`, `/api/advisory-members`, `/api/users`, `/api/members-directory` | `people`, `access_roles`, `role_permissions`, `person_grants`, `/api/people*`, `/api/access-roles*` |
| `role_transfers`, `/api/role-transfers`, `/api/my-role-transfers` | Tenures and positions (`/api/people/:id/tenures`) and access changes (`PUT /api/people/:id/access`) |
| `signup_requests` | Invites (`POST /api/people`) and bulk import |
| `team_members` (public team page data) | Public projection of `people` and tenures (slice 1) |

## Slices

1. **Public site and content.** `case_studies`, `partners`, `consulting_requests`, `consulting_responses`, `announcements`, `maintenance_mode`. Routes: `/api/content/*`, `/api/consulting-request(s)`, `/api/case-studies*`, `/api/announcements`, `/api/admin/maintenance`. It also covers the public landing sections and the team page, which is built from people who opted in.
2. **Files.** R2 `CLUB_FILES`, `CASE_STUDIES`, `BLOG_IMAGES` and `GALLERY_CDN`, plus `/api/club-files*`, `/api/gallery-cdn/*` and the gallery page. It keeps `club-file-policy` and `storage-failover` behaviour.
3. **Meets.** `club_meets`, `department_meets`, `inter_dept_meets`; notifications are queued through slice 7. The meet link stays hidden 24 h after `scheduled_at`.
4. **Department workspace.** `department_documents`, `department_instructions`, `department_projects`, and the department overview.
5. **Projects and tasks.** `projects`, `project_roles`, `project_departments`, `project_tasks`, `task_comments`, and task history and scheduling. It also includes the dashboard and the work queue.
6. **Team instances.** The `instance_*` and `team_instances` tables.
7. **Email infrastructure.** `email_queue`, `email_deliveries`, `email_hour_count`, `daily_email_count`, `rate_limits`, and the `* * * * *` cron sending over Spacemail SMTP (at most 15 per minute and 500 per hour). It includes `/api/admin/email-queue*`, `/api/send-email` and the dev outbox.
8. **Newsletter.** Uses the separate `NEWSLETTER_DB`: `newsletters`, `newsletter_subscribers` with double opt-in, editor OTP sessions and authorized emails, subscriber and unsubscribe pages, and the newsletter editor.
9. **Letter studio.** `letter_*`, `letters_sent`, and `/api/letter-studio/*`.
10. **Data migration and cutover.** This slice:
    - copies production data from `180dc-db` into `180dc-portal-db`;
    - turns `users` into `people`, mapping roles to access roles and positions;
    - keeps `srijan.guchhait@gmail.com` as an active admin;
    - moves the `180dc.vitcc.org` custom domain to `180dc-portal`;
    - retires the old Worker after checks.

## Rules carried over (see docs/domain/invariants.md)

- The email caps, the meet-link visibility window and newsletter double opt-in behave as they do today.
- People are deactivated, never deleted. Access ends on the next request.
- Schema changes go through Drizzle migrations only. Migrations are additive, and destructive changes need an explicit decision.
