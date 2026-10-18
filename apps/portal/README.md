# apps/portal — 180DC members portal (Void rewrite)

## Letter Studio

`/letters` uses existing Google personnel sessions and global/department `letters.manage` and `letters.send` grants. Admins hold both globally, directors for their department. Use the role/grant editor rather than creating a separate letter OTP allowlist.

The studio includes all 13 legacy document types. PDF export runs in a lazy-loaded browser renderer; the preview is a scaled clone, not the export surface. Save freezes the document bytes and metadata; local Download/Print and Email are independent actions. Printed signatories are not cryptographic signatures.

Private PDFs live at `CLUB_FILES/letters/` and are served only by authorized `/api/letters/:id/file` requests; shared files exclude this prefix. Save accepts 20 MiB but email requires at most 3 MiB. The minute queue loads the private bucket for required PDF attachments and records queued/accepted/failed/uncertain outcomes in `letter_sends`, which outlives generic campaign retention. See the portal letters section of `docs/contracts/api-contract.md` for all request shapes and limits.

## Newsletter

The Catalyst lives in this fresh portal: `/newsletter` (archive), `/subscriber` (double opt-in), `/unsubscribe` (request a personal link), `/unsubscribe/:token` (explicit removal), `/newsletter-editor` (Google-authenticated drafts/events) and `/admin/newsletter-subscribers` (administration). Detailed route contracts and limits are in `docs/contracts/api-contract.md` under the portal newsletter section.

All newsletter data is in this portal's Void-managed D1; do not connect it to legacy `NEWSLETTER_DB` (ADR-009). `newsletter.edit` is global for admin/director/member, `newsletter.send` for admin/director, `newsletter.manage` for admin. Grants remain configurable. Tests only reach the caller; broadcasts need explicit permission and confirmed readers. No OTP/editor allowlist tables are used.

Source uploads are limited to 20 MiB; files up to 3 MiB are also attached, larger sources are linked. Required attachment failures stop the campaign. The existing minute queue adds per-recipient unsubscribe links/headers, skips late unsubscribes/erasures, and publishes real issues only after a completed campaign has an accepted message. Email queue retries remain the delivery-recovery surface.

The rewrite of the members portal as a [Void](https://void.cloud) app in SPA + API mode. See
[ADR-007](../../docs/architecture/decisions/007-void-portal-rewrite.md). It has served production
(`180dc.vitcc.org`) since the cutover; `apps/admin-api` + `apps/frontend` remain only for rollback.

Void's version-matched docs live in `node_modules/void/docs/`. The `void` agent skill points at them.

## Layout

| Path | What lives there |
| --- | --- |
| `routes/api/**` | One file per URL. Named exports `GET`/`POST`/`PATCH`/`PUT` (`[id]` becomes a parameter). |
| `src/server/guard.ts` | `requirePrincipal` / `requirePermission`: resolve the Better Auth session to the signed-in person and their permissions (once per request). There is deliberately no `middleware/` directory: global middleware makes Void run the Worker before every static asset, so the SPA would stop being served free from Workers Assets. |
| `auth.ts` | Better Auth config: Google only, invite-only sign-up, no sessions without access. |
| `db/schema/*.ts` | Drizzle tables. `org` covers departments, terms and positions; `access` covers roles; `people` covers people, grants, tenures and audit; `content` covers case studies, partners, consulting requests, announcements, maintenance mode and rate limits; `workspace` covers department documents, instructions and department projects; `email` covers the email queue, deliveries, counters and the dev outbox; `meets` covers meets and the departments they are for; `projects` covers client projects, their departments, the people named on them and their tasks; `team-instances` covers team instances, their departments, levels, groups, teams, outside people and placements. Files are not in D1: they live in R2 buckets in the deploy account (`CLUB_FILES`, `CASE_STUDIES`, `GALLERY_CDN`, bound by name in `void.config.ts`; commit `void.lock.json` whenever bindings change), with writes mirrored to Backblaze B2 and reads falling back to it when `B2_*` secrets are set (`src/server/buckets.ts`). |
| `db/migrations/` | Generated SQL (`void db generate`) plus seeded reference data. Applied by Void on deploy and at dev start. |
| `src/server/` | Server logic shared by routes: permissions, guards, lifecycle, CSV, sign-in rules, audit. |
| `src/` | The React SPA. |
| `tests/e2e/` | API end-to-end suite (`node:test`), run against a fresh local D1. |

## Commands

```bash
pnpm --filter portal dev         # local app + API on http://localhost:5173 (migrations apply on start)
pnpm --filter portal build       # production build (about 3 s)
pnpm --filter portal typecheck   # void prepare + tsc
pnpm --filter portal test:unit   # pure logic: permissions, lifecycle, CSV
pnpm --filter portal test:e2e    # starts its own dev server on a temp database
```

Local development needs `apps/portal/.env` (gitignored) with `AUTH_GOOGLE_CLIENT_ID` and `AUTH_GOOGLE_CLIENT_SECRET`.
For real Google sign-in locally, the OAuth client must allow `http://localhost:5173/api/auth/callback/google`.

The e2e harness signs people in by creating real Better Auth `user`/`session` rows in the temp database and signing the
cookie with Void's development secret. The app has no test login of any kind.

## Patched dependency

`patches/void@1.1.0.patch` (repo root, applied by pnpm) stops Void's asset fallback from replacing `/api/*` GET 404s with the SPA's `index.html`. Without it an unknown API route or a missing file answered `200 text/html`, contrary to Void's documented behaviour. Drop the patch when upgrading to a Void release that fixes this, and keep the `404` assertions in `tests/e2e/files.test.mjs` passing.

## Deployment (CI/CD)

`.github/workflows/portal-ci.yml` checks every PR. On a push to `main` it runs `void deploy --platform cloudflare`, which:
- builds the app;
- applies new D1 migrations;
- uploads the `180dc-portal` Worker and verifies the version before sending it traffic, rolling back if that check fails.

Setup (once):
- Repository secrets `PORTAL_CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. The token needs Workers Scripts Edit and D1 Edit on the account. It is separate from `CLOUDFLARE_API_TOKEN`, which the backup workflow uses.
- Worker secrets `AUTH_GOOGLE_CLIENT_ID` and `AUTH_GOOGLE_CLIENT_SECRET`, set with `void secret put`. Void creates `BETTER_AUTH_SECRET` itself.
- The Google OAuth client must allow `https://<portal host>/api/auth/callback/google`.
- The first deploy runs from one machine. Commit the `void.lock.json` it writes, then set the repo variable `PORTAL_DEPLOY=enabled`. The deploy job fails if a deploy changes `void.lock.json` without the change being committed.
- Readiness is checked on the new version's preview URL, so `workers_dev` and `preview_urls` are on and CI sets `CLOUDFLARE_WORKERS_SUBDOMAIN=srijan-guchhait`. On a brand-new Worker these settings only apply after the first activation. If the first `void deploy` stops because a preview URL is missing, run `pnpm -w exec wrangler triggers deploy -c "$PWD/.void-wrangler.jsonc"` once, then deploy again.

The portal is live at https://180dc.vitcc.org (also https://180dc-portal.srijan-guchhait.workers.dev). Its D1 database is `180dc-portal-db`. Send live broadcasts from `180dc.vitcc.org`, because mail links use the sending request's origin.

Static files are served by Workers Assets and do not invoke the Worker. Only `/api/*` and `/__void/*` run it. Do not add files under `middleware/`: any global middleware makes Void run the Worker before every asset. Resolve per-request state in `src/server/guard.ts` instead.

## Email

Mail goes through [Cloudflare Email Sending](https://developers.cloudflare.com/email-service/) using `sendEmail` from `void/email` and the `SEND_EMAIL` binding declared in `void.config.ts` (ADR-008). The sender is `noreply@180dc.vitcc.org`, set in `src/server/email/sender.ts`, and the binding accepts no other address. `180dc.vitcc.org` is onboarded for sending in the deploy account (`cf-bounce` MX, SPF and DKIM records, plus DMARC). The account is on Workers Paid, so any recipient can be reached: 3,000 messages a month are included, then $0.35 per 1,000. Nothing receives mail at the sending address, so mail a person writes (custom mail, consulting replies) sets Reply-To to that person. `email.from` is deliberately unset: it would make Void manage Email Routing as well, which the portal does not use.

`EMAIL_HOURLY_LIMIT` optionally overrides the self-imposed 500/hour cap. `daily_email_count` is reporting only, not a daily cap.

The awaited `crons/email.ts` job runs every minute. Campaigns send one message per recipient, pace attempts 1.5 seconds apart, use at most 90% of the hourly allowance, and attempt at most 15 recipients per invocation. Direct mail shares the hourly counter. Each send atomically reserves capacity first and releases it unless the message was, or may have been, accepted; a crash can conservatively retain a reservation until the next hour. Acceptance and its tracking write are separate operations, so a crash between them can resend a message. Delivery records mean acceptance by Cloudflare, not inbox delivery.

`src/server/email/outcome.ts` maps each `sendEmail` result:

| Result | Effect |
|---|---|
| accepted | `sent` |
| `QUOTA_EXCEEDED` (Cloudflare's rate or daily limit) | pause; the rest of the hour is marked as used |
| `BINDING_MISSING`, `INVALID_FROM`, `UPSTREAM_ERROR` | pause without failing anyone; a campaign fails after five claims without progress |
| `INVALID_TO`, `UNVERIFIED_DESTINATION`, `MIME_ERROR`, `IDEMPOTENCY_CONFLICT` | that recipient fails |
| `OUTCOME_UNKNOWN` | that recipient fails but keeps its hourly reservation, since Cloudflare may have accepted it; only an explicit retry resends it |

Under `pnpm dev`, Void captures every message in its dev inbox (the URL and token are printed at startup); nothing is delivered. Real delivery is checked on the deployed Worker. For tests, `EMAIL_TEST_MODE=capture` records accepted mail in `dev_outbox` instead, and answers for the reserved domains `unverified.invalid`, `unknown.invalid`, `upstream.invalid` and `quota.invalid` with the matching error. Capture is disabled in production builds and when `ENVIRONMENT=production`; the `.dev.ts` outbox and drain routes are excluded from production.

The e2e harness awaits the real `/__void/scheduled` trigger with the startup token before reading queue or outbox state; it uses no delivery sleeps or polling. `tests/e2e/email-transport.test.mjs` runs without capture and reads the raw messages from Void's dev inbox. Queue attachments reference keys in `CASE_STUDIES`; missing or unreadable objects are logged and omitted.

## Access model

- **Status** (`people.status`) decides whether someone can sign in at all:
  - `active` and `on_leave` keep access.
  - `invited` becomes `active` on the person's first Google sign-in with that verified email.
  - `alumni` and `removed` lose access on their next request, and their sessions are deleted.
  - People are never deleted.
- **Permissions** are keys in `src/server/permissions.ts`. A person's permissions are:
  - the grants of their access role, each with scope `global` or `department` (department scope means the person's own department);
  - plus personal grants, each global or limited to one department.
- **Positions** are titles (per department or club-wide) recorded as tenures per term. They never grant access.

To add a permission:
1. Add the key to `PERMISSIONS`.
2. Grant it to roles in a new migration.
3. Check it in the route with `requirePermission(c, 'key', departmentId)`.

## API

| Method and path | Permission |
| --- | --- |
| `GET /api/me` | signed in |
| `GET /api/people?q&status&department&role&position&term` | `people.view` (private fields need `people.view_private` or being yourself) |
| `POST /api/people` | `people.invite` for the department. A role other than `member` also needs `people.grants`. |
| `GET /api/people/:id` | `people.view` or yourself; includes tenure history, and `grants` (extra permissions) only for viewers with `people.grants`, otherwise `null` |
| `PATCH /api/people/:id` | yourself (profile fields) or `people.edit` for the department. Moving departments needs `people.edit` for both. |
| `POST /api/people/:id/status` | `people.lifecycle` for the department; not on yourself |
| `PUT /api/people/:id/access` | `people.grants`; not on yourself |
| `POST /api/people/:id/tenures`, `POST /api/tenures/:id/end` | `people.edit` for the position's department |
| `GET /api/positions`, `POST /api/positions`, `PATCH /api/positions/:id` | signed in to read; `positions.manage` for the department to write |
| `GET /api/terms`, `POST /api/terms`, `POST /api/terms/:id/start` | signed in to read; `terms.manage` to write |
| `GET /api/access-roles`, `PUT /api/access-roles/:id` | signed in to read; `roles.manage` to write. The `admin` role is fixed. |
| `GET /api/exports/people` | `people.export` (rows limited to the departments you may export) |
| `POST /api/imports/people` | `people.import`; `{ csv, dryRun }` with columns `email,full_name,department,position,access_role` |
| `GET /api/audit` | `audit.view` |
| `GET /api/departments` | public (100/min per IP): id, name, description, active |
| `GET /api/admin/email-queue`, `GET /api/admin/email-queue/:id/deliveries` | `email.view` (global campaign visibility). Includes shared hourly usage and acceptance records. |
| `POST /api/admin/email-queue/:id/retry-failed` | `email.manage`; 409 while sending, 400 with no failures, 404 if missing. Settled recipients are not resent. |
| `POST /api/send-email` | `email.send`; `{to,subject,body}`, with comma/space/semicolon-separated email addresses in `to`. Department-scoped senders can only reach active/on-leave people in permitted departments. Up to 10 recipients send directly; larger sets and quota-paused direct sends queue and return `campaignId`. Replies go to the sender (Reply-To). |
| `GET /api/dev/outbox`, `DELETE /api/dev/outbox`, `POST /api/dev/drain-email` | Development test mode only; production routes are absent. Drain is capture-only and awaited. |
| `GET /api/departments/:id/members` | `departments.members.view` for that department. People whose home department it is, active or on leave, with their current-term positions. |
| `GET /api/departments/:id/instructions` | `departments.instructions.view` for that department |
| `POST /api/departments/:id/instructions`, `DELETE /api/departments/:id/instructions/:instructionId` | `departments.instructions.manage` for that department |
| `GET /api/departments/:id/overview` | `departments.workspace.view` for that department: documents, instructions and department projects |
| `POST /api/departments/:id/documents`, `DELETE /api/departments/:id/documents/:documentId` | `departments.documents.manage` for that department (links only; http(s) URLs) |
| `POST /api/departments/:id/projects`, `PUT /api/departments/:id/projects/:projectId/status` | `departments.projects.manage` for that department. This tracker is separate from club-wide projects. |
| `GET /api/content/case-studies`, `GET /api/content/partners`, `GET /api/content/team-members` | public (rate limited 100/min per IP). Team lists active/on-leave people with an open current-term tenure; public fields only. |
| `POST /api/consulting-request` | public (1 per hour per IP) |
| `GET /api/consulting-requests`, `DELETE /api/consulting-requests/:id`, `POST /api/consulting-requests/:id/accept`, `POST /api/consulting-requests/:id/reject` | `consulting.manage`. Decisions and replies are recorded even if mail cannot be sent; `emailSent` reports acceptance by Cloudflare. Client replies go to the deciding admin (Reply-To). |
| `GET /api/case-studies`, `POST /api/case-studies`, `PUT /api/case-studies/:id` | `content.publish` |
| `DELETE /api/case-studies/:id` | `content.manage` |
| `POST /api/partners`, `PATCH /api/partners/:id`, `DELETE /api/partners/:id` | `content.manage` |
| `GET /api/meets` | `meets.view`. Club-wide and inter-department meets, plus department meets within the caller's `meets.department.view` scope; earliest first, each with its departments. `meetLink` is null once a meet is more than a day past. |
| `POST /api/meets` | `{kind, title, scheduledAt, meetLink?, description?, departmentIds?}`. `club` needs global `meets.club.manage` and no departments; `department` needs `meets.department.manage` for exactly one department; `inter_department` needs global `meets.inter_department.manage` and one or more departments. Queues an announcement to the audience (active and on-leave people; club-wide mail leaves out advisory members without a department) and returns 201 `{id, campaignId, queued}`. 60/hour. |
| `DELETE /api/meets/:id` | the manage permission for that meet; 404 if missing. Announcements already queued still go out. 60/hour. |
| `POST /api/meets/:id/notify` | the manage permission for that meet; queues a new announcement, without the link once the meet is a day past. 10/hour per client. |
| `GET /api/projects` | signed in. Projects the caller can see, newest first, with departments, task progress, the caller's role on each (`myRole`) and their rights (`access`). A project is visible through `projects.view` (or a project management grant) covering one of its departments, or by being named on it. |
| `POST /api/projects` | `projects.manage` covering every selected department. `{name, client?, description?, termId?, deadline?, departmentIds}`; emails the departments' leads (people there with `projects.tasks.manage`). 201 `{id, notified}`. 60/hour. |
| `GET /api/projects/:id` | visible projects only (404 otherwise): details, departments, people, tasks (each with `version`, a live comment count (`comments`) and `canUpdateStatus`) and `access`. |
| `PATCH /api/projects/:id`, `DELETE /api/projects/:id`, `PUT /api/projects/:id/status` | `projects.manage` covering all the project's departments (and any new ones on PATCH). DELETE removes its tasks and people too. `status` is `active` or `completed`; completed projects are public. |
| `GET /api/projects/:id/people` | `projects.members.manage` or `projects.tasks.manage` on the project. Everyone with access, with `member` and `canSee`, for the pickers. |
| `POST /api/projects/:id/members`, `DELETE /api/projects/:id/members/:memberId` | `projects.members.manage` covering one of its departments. `{personId, role}`; the person must have access; 409 if already on it; emails them. |
| `POST /api/projects/:id/tasks`, `PATCH`/`DELETE /api/projects/:id/tasks/:taskId`, `POST /api/projects/:id/complete-tasks` | `projects.tasks.manage` covering one of its departments. `{title, description?, assigneeId?, dueDate?, priority?}`; assignees must be able to see the project. PATCH needs the task's current `version` (409 otherwise). 300/hour. |
| `PUT /api/projects/:id/tasks/:taskId/status` | the assignee or a task manager. `{status: 'pending' \| 'completed'}`; 409 if the task changed meanwhile. |
| `GET /api/projects/:id/tasks/:taskId/comments`, `GET /api/projects/:id/tasks/:taskId/history` | anyone who can currently see the project; 404 for hidden projects or wrong task parentage. Newest first, 50/page; `?before=<nextBefore>` loads older entries. Private, no-store; 120 reads/minute per endpoint. History exposes allow-listed fields, never comment text or raw audit details. |
| `POST /api/projects/:id/tasks/:taskId/comments` | any project reader. `{requestId: UUID, body: plain text (1-4000 raw characters, trimmed)}`. A retry with the same author/request id, task and text replays the original 201 result; changed or removed requests are 409. 30 writes/minute. Comment and audit insert atomically. |
| `DELETE /api/projects/:id/tasks/:taskId/comments/:commentId` | comment author or project task manager. Erases the text and retains a removed marker; repeating is a no-op. Removal and audit are atomic. Shares the comment write limit. |
| `GET /api/today` | signed in, 60/minute. `generatedAt`, up to 100 open assigned tasks on visible active projects, up to 20 relevant meets in the next seven days, three announcements and permission-scoped attention counts, with overflow flags. Private, no-store. |
| `GET /api/content/projects` | public. Completed projects `{id, name, client, description, completedAt}`, most recently completed first. 100/minute. |
| `GET /api/team-instances` | `team_instances.view` or `team_instances.manage` (advisory members hold neither). Instances whose departments the caller's grants cover, newest first, with `departments`, `stats {teams, placements, short}` and `access {view, staff, configure}`. |
| `POST /api/team-instances` | `team_instances.manage` covering every selected department. `{name, description?, groupLabel? (default "Company"), departmentIds, levels? (1-20 names; blanks become "Level N")}`. 201 `{id}`. 120 writes/hour per client, shared by every instance, group, team and outside-person write. |
| `GET /api/team-instances/:id` | visible instances only (404 otherwise): departments, levels, groups with their teams, teams in no group, each team's people (members, then outside people) with `count`, `short` and `full`, the outside-people register (emails only for staff), `stats` and `access`. |
| `PATCH /api/team-instances/:id`, `DELETE /api/team-instances/:id` | configure: `team_instances.manage` covering all its departments (and any new ones on PATCH). A shorter ladder moves teams above it to the new last level. DELETE removes everything in it; the audit trail stays. |
| `GET /api/team-instances/:id/people`, `GET /api/team-instances/:id/activity` | `people`: staff (manage covering one of its departments); people the caller may place. `activity`: viewers; the latest 30 changes, never emails. |
| `POST /api/team-instances/:id/groups`, `PATCH`/`DELETE …/groups/:groupId`, `POST /api/team-instances/:id/externals`, `PATCH`/`DELETE …/externals/:externalId`, `POST /api/team-instances/:id/teams`, `PATCH`/`DELETE …/teams/:teamId` | staff. Deleting a group keeps its teams. Outside emails are unique per instance ignoring case (409). Team sizes 1-500 or null; `currentLevel` within the ladder; `status` `active`, `eliminated` or `winner`; a cap below who is on the team is 409 `cap_below_members`. |
| `POST …/teams/:teamId/members` `{personId}`, `POST …/teams/:teamId/externals` `{externalId}`, `DELETE` either, `POST /api/team-instances/:id/move` | staff, 600/hour per client. The cap is checked inside the insert (409 `team_full`, `already_on_team`); members must be eligible and in the caller's scope. A move's insert and removal commit together. DELETE is idempotent (`{removed}`). |
| `GET /api/announcements` | signed in |
| `POST /api/announcements`, `DELETE /api/announcements/:id` | `announcements.manage` |
| `GET /api/admin/maintenance` | public |
| `POST /api/admin/maintenance` | `site.maintenance`. While on, signed-in API calls return 503 `maintenance` for anyone without it; public routes stay up. |
| `GET /api/club-files?category&eventName&projectName&search`, `GET /api/club-files/events`, `GET /api/club-files/projects`, `GET /api/club-files/:id/download` | `files.view`. Only the `general/`, `projects/` and `events/` prefixes of `CLUB_FILES` are listed or served. |
| `POST /api/club-files/upload` (multipart), `DELETE /api/club-files/:id` | `files.manage` (20/hour each). 25 MB limit and an extension allow-list. |
| `POST /api/case-studies/upload-image`, `upload-source`, `upload-document` (multipart); `DELETE /api/case-studies/delete-image` | `content.publish`. `upload-document` turns a PDF or DOCX into sanitized HTML and stores nothing. |
| `GET /api/case-studies/images/*` | public (200/min per IP): `images/` and `source/` keys of `CASE_STUDIES` |
| `GET /api/gallery-cdn/*` | public, cached for a year: photos in the `GALLERY_CDN` bucket listed by `src/data/galleryManifest.json` |

## Invitations and first-login checklist

Invitations validate all references before atomically saving personnel, optional tenure, audit and queued Google-only invitation email. CSV dry runs do not queue mail. Today shows a nonblocking first-login checklist; public profile completeness is derived, read items are acknowledged explicitly, and phone/registration number remain optional.
