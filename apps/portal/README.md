# apps/portal — 180DC members portal (Void rewrite)

## Clients (CRM)

`/crm` is the client pipeline: a stage board and list of opportunities, my overdue next steps, organisation pages (contacts, opportunities, touchpoints, access), opportunity pages (stage, next step, touchpoints, proposals) and engagement pages with the closeout checklist. The nav entry shows only with `crm.view`.

Access is per record, never by title. A member sees an organisation, contact or opportunity only as `crm.admin`, its owner, or someone explicitly granted that record (an organisation grant covers its contacts and opportunities). Contact email, phone, consent and restricted notes need organisation- or contact-level access; an opportunity-only grant shows names only. Hidden records answer 404 on details and are absent from lists, search, counts and the engagement list; a known record the caller may see but not change answers 403. Grants and ownership are read live, so a revocation or ownership handover takes effect on the next request.

Seeded roles: admin gets `crm.view`, `crm.manage` and `crm.admin`; director gets `crm.view` and `crm.manage`; member gets `crm.view` (they see only what they are given). Default stages are lead, qualified, discovery, proposal, won and lost; CRM admins add, relabel, reorder or retire open stages.

Flows: "Open in CRM" on a consulting request (needs `consulting.manage` and `crm.manage`) creates or reuses the organisation (by normalised website/email domain), contact (by email) and opportunity; converting again returns the same records. Lost needs a reason code; won is reached only by accepting a sent proposal, which freezes its versions and creates one engagement plus its canonical project (needs project-manage rights for the chosen departments). Closing an engagement requires deliverables accepted, files archived and knowledge transfer; with the client's case-study consent it adds an internal `crm_case_study_drafts` row and never publishes to `case_studies`. CRM admins see duplicate groups and merge organisations or contacts, re-pointing their children and grants.

Email touchpoints keep a subject and an opaque `external_ref` only, never a message body. CRM does not read the shared-mailbox tables yet; linking mailbox conversations to CRM records is a follow-up, as is a client-facing guest workspace.

## Member lifecycle

Every status change (invite, first sign-in, manual lifecycle move, term start, offboarding) appends to `person_status_history` with actor, reason and effective date. `POST /api/people/:id/status` additively accepts `reason` (the older `note` still works) and `effectiveOn` (never in the future); the person page asks for a reason.

**Secondary memberships** list a person in another department for a period. The directory's department filter includes them, but department-scoped permissions keep following the primary `people.department_id`; a secondary department grants nothing unless someone adds an explicit personal grant.

**Promotions** are proposed by someone with `people.edit` for the position, then approved by a different person holding `people.promotions.approve` for the position's department (club-wide positions need a global grant). Neither the proposer nor the person concerned can approve. Approval writes in one batch: the tenure, an open access review saying access is unchanged, a notification through the existing email queue and the audit entry. It never changes access roles or personal grants; those stay a separate `people.grants` decision on `PUT /api/people/:id/access`, which still refuses any change to your own access. A Letter Studio document id may be linked; no new PDF engine.

**Reports-to** is set per tenure (`PATCH /api/tenures/:id`, cycles refused). `/org-chart` shows one term's positions, holders and reporting lines.

**Offboarding** (`people.offboard` for the person's department) moves someone to alumni or removed in one D1 batch with every registered cleanup step, then records a handover checklist and returns a per-step summary. Re-running it changes nothing (`changed: false`). Built-in steps: open tasks and project roles go to a chosen active successor (required when there is work to hand over), current tenures end, personal grants are removed and sessions are revoked. Shared-mailbox capability rows are deleted with a `mailbox.offboard` entry in each mailbox's audit, so reinstatement does not restore inbox access; the mailbox dispatcher already refuses approved sends whose approver lost their grant. CRM: owned organisations and opportunities, engagement client-owner/lead roles and owner-role record grants go to the successor (merged records keep their historical owner), every CRM record grant of the leaver is removed, and each change is audited (`crm.owner.reassign`, `crm.engagement.reassign`, `crm.grant.remove`). The successor still needs `crm.view` to open the CRM; ownership grants no permission.

Later packages add their own cleanup with `registerOffboardingStep({ key, label, plan })` from `src/server/offboarding.ts`. `plan(context)` reads current state and returns `{ count, needsSuccessor, statements, items? }`: unexecuted Drizzle writes that join the single batch, and that must change nothing when the step has nothing left to do (count 0). With `successorId: null` the call is a preview and its statements are discarded. Import the registering module from `routes/api/people/[id]/offboard.ts`, as `src/server/mailboxes/offboarding.ts` is.

**Onboarding policies** (`onboarding.manage`, `/admin/onboarding-policies`) add acknowledgement items to the first-login checklist. **Board handover** (`/handover`) is a per-term checklist built by `terms.manage`; owners see and tick their own items.

This implementation does not complete the assigned section 5 / 13.E scope.
The requirement-by-requirement map in `docs/execution/member-lifecycle-coverage.md`
(from the repository root) identifies uncovered work, including integrated
letter issuance, recruitment, member development, native-device revocation,
mailbox/review transfer and verified board authority handover. These are not
approved scope exclusions.

## Shared mailboxes

`/mailboxes` is separate from the global system-email composer. Mailbox-local grants independently control reading, drafting, editing, submission, review, approval, sending, assignment, management and audit. A manager has no implicit message access; platform `mailboxes.admin` can create a mailbox with a different manager and recover another person's access, never grant themselves inbox rights.

Saving creates an immutable revision containing the normalized To/CC/BCC, server-selected From, subject, message, signature, attachment checksums and content digest. Submission freezes that revision. Approval requires review, approve and send capabilities and, by default, a different reviewer. An edit invalidates approval and cancels a pending intent. Every dispatch rechecks current grants, membership status, mailbox policy and the exact approved snapshot in its atomic claim.

New mailboxes have outbound transport disabled. Development capture is never available in production. The Cloudflare adapter is replies-only and rejects outreach or an unthreaded message; the production sender binding remains restricted to `noreply` until the separately approved inbound-pilot configuration. This package makes no DNS or routing changes and enables no live shared-mail sending.

The minute cron records `accepted`, `failed` or `outcome_unknown`, never invented delivery confirmation. An interrupted claim becomes uncertain after 15 minutes and is not automatically resent. A global `/api/admin/mail-outbound` pause is independent of general maintenance mode. Private attachments use `CLUB_FILES/mail-files/` and cannot be reached through the shared file library; total raw attachments are capped at 3 MiB and checked again before dispatch.

See ADR-011 and the shared-mailbox API contract. Inbound conversations, routing, CRM links and Template Studio are subsequent packages, not features of this increment.

## Internal messaging

`/messages` lists the conversations a member can read now: direct conversations, their department's channel and the channels of projects they can see. Unread badges (capped at 99) appear in the list and in the navigation. Direct messages start from a person's profile and only between two current `active`/`on_leave` members; once the other person leaves the club the conversation becomes read-only. Department pages and project pages open their channel. Department channels follow home department or `departments.workspace.view`; project channels reuse `visibleProjects`, the same rule as the project list. Every list, count, search, mention notice and detail read evaluates the access predicate again, so a person who moves department, leaves a project or becomes alumni loses access on the next request. An inaccessible conversation is 404, never a hint that it exists.

Messages are plain text with `@[Name](personId)` mentions. Authors can edit for 15 minutes after sending; deleting leaves a tombstone with the body erased and its reactions, search hit and mention notices removed. Sends are idempotent per `requestId`. A mention creates a notice only for mentioned people who can read the conversation at that moment, have not muted it and have not turned off mention notices. Members can report someone else's message; holders of `chat.moderate` (seeded to `admin`) review reports at `/admin/message-reports` and can dismiss or remove them. Removal is audited without the message text.

`/notifications/preferences` stores, per category (`mentions`, `tasks`), in-app on/off, an email-digest opt-in (default off) and quiet hours. In-app task and mention notice creation respects the in-app switch. Quiet hours use India time, including overnight intervals, with an inclusive start and exclusive end. During a quiet interval that category leaves the notification badge; the unread inbox stays available and pending notices return to the badge after quiet hours end. Disabling in-app notices also removes that category's existing notices from the badge. **Email digests are not sent:** the opt-in is stored only. A digest would be metered Cloudflare Email Sending and needs its own governed package.

The browser polls instead of holding a live connection: an open conversation every 10 s, the list and nav badge every 30 s, only while the tab is visible. Club-scale traffic fits D1 reads comfortably, and polling needs no Durable Object, WebSocket binding or new billing surface. A move to Durable State/WebSockets is the follow-up if message volume or latency needs change.

## Documents and knowledge

This is partial DOC-01 coverage. See [the section 8.2 coverage map](../../docs/execution/doc-b4-coverage.md) for implementation/test evidence and explicit gaps. In particular, retention dates and review status are metadata, not an enforced retention schedule or download-approval workflow.

Project files, task files and shared club files have one document lifecycle. Each upload is an immutable version with a SHA-256 checksum, uploader and time. Restoring copies an old version into a new one, so history is never rewritten. Existing files enter the lifecycle lazily, with their original object as version 1. Old download URLs always return the latest version. New version bytes live under `CLUB_FILES/document-versions/<documentId>/` and use the same 25 MiB file policy and storage failover. No bucket or binding is added. Every deleted version row, including parent project, task and file cascades, queues its object key through a D1 trigger for the existing `*/5` cleanup cron.

Anyone who can read a file can create a share link that expires within 30 days, with an optional download limit and optional member sign-in. The 32-byte token is shown once and only its SHA-256 hash is stored. A link serves the version that was current when it was created. It stops working, with a 404, when it is revoked, expires, reaches its limit, the document is archived, or its creator loses access to the file. Downloads are attachment-only, `private, no-store`, `nosniff` and sandboxed, with a sanitized filename. A conditional counter update decides each download, so concurrent requests cannot exceed the limit. Managers can set the retention date (metadata only, nothing is erased automatically), legal hold, archived and review status. Deleting a held file returns 409.

Legal holds also block deletion of a parent task or project with held attachments. The API returns 409 `legal_hold`; a database trigger prevents cascade deletion from bypassing the hold.

`/knowledge` holds club-wide or department-scoped articles with draft/published/archived status, tags, links to projects/tasks/meets and full revision history. Reading needs `knowledge.view` (every role by default). Department articles are visible only to that department and to holders of `departments.workspace.view` for it. Drafts and archived articles are visible only to editors. `knowledge.edit` writes drafts and reads history, and `knowledge.publish` changes status (directors hold both for their department, admins hold them globally). List and search apply these rules in SQL at query time. Bodies are a small Markdown dialect (`#` headings, `**bold**`, `code`) that escapes HTML first and creates no links. Linked IDs are checked against the editor's access on write, and hidden links are dropped on read. Antivirus scanning and e-signatures are out of scope.

## Collaboration and onboarding

Inviting a person validates all references before atomically saving their personnel record, optional tenure, audit and queued invitation email. CSV dry runs never send or queue mail. Invitations contain a Google sign-in link, not a password or registry token. Today shows a nonblocking first-login checklist with derived profile progress and explicit read acknowledgments.

Tasks can be blocked with a required reason, then unblocked or completed through the existing versioned status flow. Today applies project visibility, ordering and its 101-row bound in SQL. `/notifications` is a small unread inbox for assignments, comments and tasks due today/tomorrow UTC; source mutations and notices commit together. The hourly reminder cron is `5 * * * *`.

Department and client work use the same project workspace. `internal` projects never publish; the migration copies existing portal-local department tracker rows without dropping them, preserving their old IDs for compatibility. This is not a legacy Worker data import. Department pages link to canonical projects, and team instances open on Roster.

Meets support manager-edited agendas and notes and links to existing project tasks, filtered by the viewer's current project access. Project/task files live privately under `CLUB_FILES/project-files/`; shared-file APIs cannot reach them. Uploads reuse the shared 25 MiB file policy, with an atomic 100-file cap per scope. Metadata deletion, including parent cascades, queues primary-byte cleanup through a D1 trigger; `*/5 * * * *` drains at most 100 keys and retains failed work for retry.

The backup workflow includes `180dc-portal-db`; see [offline restore verification](../../docs/operations/BACKUP_B2.md#portal-recovery-drill). No new provider, bucket, secret or separate queue service is needed. Full request shapes are in the collaboration section of [API contracts](../../docs/contracts/api-contract.md).

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
  - `suspended` temporarily denies access: it needs a reason, sessions are deleted, and the person can be restored to `active` or `on_leave` later.
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
| `POST /api/departments/:id/projects`, `PUT /api/departments/:id/projects/:projectId/status` | Compatibility routes for canonical internal projects. Management must cover all linked departments; migrated source IDs remain resolvable. |
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
| `GET /api/projects` | signed in. Authorized projects, newest first, with departments, task progress, `myRole` and `access`. Client-project grants alone never open internal work: internal eligibility requires workspace authority or explicit named membership. |
| `POST /api/projects` | `{name, client?, description?, termId?, deadline?, departmentIds, internal?}`. Project management covers every selected department; eligible internal department managers may create internal work. Only authorized department leads are emailed. 201 `{id, notified}`. 60/hour. |
| `GET /api/projects/:id` | visible projects only (404 otherwise): details, departments, people, tasks (each with `version`, a live comment count (`comments`) and `canUpdateStatus`) and `access`. |
| `PATCH /api/projects/:id`, `DELETE /api/projects/:id`, `PUT /api/projects/:id/status` | Management covering all linked departments, after internal eligibility checks. Stages: `upcoming`, `active`, `on_hold`, `completed`. Only completed non-internal work publishes. DELETE also removes child metadata and queues attachment-byte cleanup. |
| `GET /api/projects/:id/people` | `projects.members.manage` or `projects.tasks.manage` on the project. Everyone with access, with `member` and `canSee`, for the pickers. |
| `POST /api/projects/:id/members`, `DELETE /api/projects/:id/members/:memberId` | `projects.members.manage` covering one of its departments. `{personId, role}`; the person must have access; 409 if already on it; emails them. |
| `POST /api/projects/:id/tasks`, `PATCH`/`DELETE /api/projects/:id/tasks/:taskId`, `POST /api/projects/:id/complete-tasks` | `projects.tasks.manage` covering one of its departments. `{title, description?, assigneeId?, dueDate?, priority?}`; assignees must be able to see the project. PATCH needs the task's current `version` (409 otherwise). 300/hour. |
| `PUT /api/projects/:id/tasks/:taskId/status` | the assignee or an eligible task manager. `{status: 'pending' \| 'blocked' \| 'completed', blockedReason?}`; blocking requires a nonblank reason (up to 500 characters). 409 if the task changed meanwhile. |
| `GET /api/projects/:id/tasks/:taskId/comments`, `GET /api/projects/:id/tasks/:taskId/history` | anyone who can currently see the project; 404 for hidden projects or wrong task parentage. Newest first, 50/page; `?before=<nextBefore>` loads older entries. Private, no-store; 120 reads/minute per endpoint. History exposes allow-listed fields, never comment text or raw audit details. |
| `POST /api/projects/:id/tasks/:taskId/comments` | any project reader. `{requestId: UUID, body: plain text (1-4000 raw characters, trimmed)}`. A retry with the same author/request id, task and text replays the original 201 result; changed or removed requests are 409. 30 writes/minute. Comment and audit insert atomically. |
| `DELETE /api/projects/:id/tasks/:taskId/comments/:commentId` | comment author or project task manager. Erases the text and retains a removed marker; repeating is a no-op. Removal and audit are atomic. Shares the comment write limit. |
| `GET /api/today` | signed in, 60/minute. Up to 100 pending/blocked assigned tasks on visible active projects, bounded after authorization in SQL; up to 20 relevant meets, three announcements, scoped attention counts and overflow flags. Private, no-store. |
| `GET /api/content/projects` | public. Completed non-internal projects `{id, name, client, description, completedAt}`, most recently completed first. 100/minute. |
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
