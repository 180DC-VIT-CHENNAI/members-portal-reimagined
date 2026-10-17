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
7. **Email infrastructure.** `email_queue`, `email_deliveries`, `email_hour_count`, `daily_email_count`, `rate_limits`, and the `* * * * *` cron sending through Cloudflare Email Sending (`sendEmail` from `void/email`, ADR-008; at most 15 per minute and 500 per hour). It includes `/api/admin/email-queue*`, `/api/send-email` and the dev outbox.
8. **Newsletter.** Uses the separate `NEWSLETTER_DB`: `newsletters`, `newsletter_subscribers` with double opt-in, editor OTP sessions and authorized emails, subscriber and unsubscribe pages, and the newsletter editor.
9. **Letter studio.** `letter_*`, `letters_sent`, and `/api/letter-studio/*`.
10. **Blank-data launch and cutover.** This slice:
    - launches with fresh portal databases and empty portal R2 buckets; no records or objects are copied from the old Worker;
    - verifies the reference data and initial admin seeded by the portal migrations, including `srijan.guchhait@gmail.com` with full admin access and the title "Technical Lead - DevOps & Cloud";
    - verifies that new people can be invited or bulk imported and then sign in through Google;
    - moves the `180dc.vitcc.org` custom domain to `180dc-portal`;
    - retires the old Worker after checks.

The user explicitly chose a new deployment with blank data rather than a data migration. Existing records and files stay in the old deployment; empty portal buckets are expected. Do not import old sessions, registry tokens, personnel records or R2 objects as part of this launch.

## Delivery status

- Personnel foundation: PRs #14–#18, merged.
- Public site/content (slice 1): PR #22, merged.
- Files (slice 2): PR #23, with deployment fixes in #24–#25, merged and deployed.
- Department workspace (slice 4): PR #26, merged and deployed. The live public `/api/departments` returns all six seeded departments.
- Email infrastructure (slice 7): PR #28, merged and deployed; its Spacemail SMTP transport was then replaced with Cloudflare Email Sending at the user's request (ADR-008).
- Next implementation order: meets (3), projects/tasks (5), team instances (6), newsletter (8), letter studio (9), then cutover (10). Meets must enqueue real notifications through slice 7.

## Rules carried over (see docs/domain/invariants.md)

- Email uses the shared 500/hour allowance by default, with the campaign queue using at most 90% and attempting at most 15 recipients per minute. The old implementation counts daily sends but does not enforce a 100/day limit; this port does not introduce one.
- The meet-link visibility window and newsletter double opt-in behave as they do today.
- People are deactivated, never deleted. Access ends on the next request.
- Schema changes go through Drizzle migrations only. Migrations are additive, and destructive changes need an explicit decision.
