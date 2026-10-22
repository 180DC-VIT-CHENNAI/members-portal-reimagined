# Data Model — 180DC VIT Chennai Platform

## Void portal CRM schema

`apps/portal/db/schema/crm.ts`, additive migration `20261019163901_dark_madripoor.sql` and its snapshot. The migration also seeds the default stages and the admin/director/member CRM grants.

| Table | Key | Purpose |
| --- | --- | --- |
| `crm_stages` | text id | Configurable pipeline stages: label, kind (open/won/lost), order, active. |
| `crm_organizations` | UUID | Name, website and normalised `domain` (dedupe), industry, geography, tags, lifecycle, owner, source, `merged_into_id`. |
| `crm_contacts` | UUID, organisation FK | Name, role, business email (lower-cased), phone, consent, do-not-contact, preferred channel, restricted notes, `merged_into_id`. |
| `crm_opportunities` | UUID, organisation/stage FKs | Owner, source, priority, primary contact, next action and due date, lost reason/note, closed time; unique `consulting_request_id`. |
| `crm_record_access` | unique (record_type, record_id, person_id) | Explicit collaborator/co-owner grants on an organisation, opportunity or contact. |
| `crm_touchpoints` | UUID, organisation FK | Meeting/email/call/note/milestone on an organisation, optional contact and opportunity; email keeps only `external_ref`. |
| `crm_proposals` / `crm_proposal_versions` | UUID; unique (proposal_id, version) | Status draft/sent/accepted/declined and current version; versions hold scope, objectives, timeline, deliverables and `frozen_at`. |
| `crm_engagements` | UUID; unique opportunity and project | Accepted work: proposal, canonical project, client owner, lead, confidentiality, status, closeout checklist, feedback, case-study consent. |
| `crm_case_study_drafts` | UUID; unique engagement | Internal draft created at closeout only with consent; never copied to `case_studies`. |
## Void portal member-lifecycle schema

`apps/portal/db/schema/lifecycle.ts` (plus `onboarding_policies` in `onboarding.ts` and `tenures.reports_to_person_id`), additive migration `20261019163832_volatile_stardust.sql` and its snapshot:

| Table | Key / constraint | Purpose |
|---|---|---|
| `person_status_history` | autoincrement id, person FK | Every status transition: from/to, reason, effective date, actor. |
| `department_memberships` | UUID, person/department FKs | Secondary department, note, valid from/until. Grants no department permissions. |
| `promotion_proposals` | UUID; person, position, term, proposer, decider, tenure FKs | Pending/approved/rejected/withdrawn proposal, rationale, optional Letter Studio document id, resulting tenure. |
| `promotion_decisions` | proposal id PK | One decision per proposal: actor, action, note. |
| `access_reviews` | UUID, unique `(source_type, source_id)` | Open/reviewed task telling `people.grants` holders that a title change left access unchanged. |
| `offboarding_records` | UUID, person/successor FKs | Target status, reason, effective date, JSON checklist and per-step summary. |
| `board_handover_items` | UUID, term/owner FKs | Incoming-board checklist item, owner, done state. |
| `onboarding_policies` | UUID | Admin-configured acknowledgement items for the first-login checklist. |

`tenures.reports_to_person_id` (nullable, people FK) records reporting lines. The migration also grants `people.promotions.approve` and `people.offboard` (admin global, director department) and `onboarding.manage` (admin). Nothing is backfilled: status history starts with this release.

## Void portal documents and knowledge schema

`apps/portal/db/schema/documents.ts`, `knowledge.ts` and additive migration `20261021130410_adorable_true_believers.sql`:

| Table | Key | Notes |
|---|---|---|
| `documents` | file ID (project file or shared club file) | `project_file_id` (cascade) or `shared_key`, owner, `retention_until`, `legal_hold`, `archived`, `review_status`, current `revision`. |
| `document_versions` | UUID; unique `(document_id, number)`, unique `key` | Immutable bytes in `CLUB_FILES`, file name, type, size, SHA-256 `checksum`, uploader, `restored_from`. Trigger `document_versions_enqueue_delete` queues the key in `project_file_deletions`. |
| `document_shares` | UUID; unique `token_hash` | Frozen `version_id`, creator, `expires_at`, `max_downloads`, `downloads`, `require_sign_in`, `revoked_at`. Tokens are never stored. |
| `knowledge_articles` | UUID; unique `slug` | `scope` global/department, `department_id`, status, owner, JSON `tags`, optional project/task/meet IDs, optimistic `revision`. |
| `knowledge_revisions` | autoincrement; unique `(article_id, number)` | JSON snapshot of each saved revision and its editor. |

The migration grants `knowledge.view` to every role, and `knowledge.edit`/`knowledge.publish` globally to admins and per department to directors.

The `documents_legal_hold_delete` trigger aborts deletion of held document rows, including cascades from files, tasks and projects, before versions can be queued for byte cleanup.

## Void portal shared-mailbox schema

`apps/portal/db/schema/mailboxes.ts`, additive migration `20261019070215_damp_kitty_pryde.sql` and its generated snapshot:

| Table | Key / constraint | Purpose |
|---|---|---|
| `mailboxes` | UUID, unique normalized address | Explicit functional identity, active/disabled/retired status, versioned policy, signature, transport and pause state. New transport is disabled. |
| `mailbox_memberships` | `(mailbox_id, person_id, capability)` | One explicit capability per row, validity interval and grant actor. Server checks active personnel too. |
| `mail_uploads` | UUID, mailbox/person FKs | Private `CLUB_FILES/mail-files/<mailbox>/<uuid>` object key, filename/MIME/size and SHA-256. |
| `mail_drafts` | UUID, mailbox/creator FKs | Revision, current snapshot, last/approved review and active intent pointers. |
| `mail_draft_snapshots` | UUID, unique `(draft_id, revision)` | Frozen From/To/CC/BCC, content, signature, attachment manifest/digests, category and content hash. Nullable conversation/template references reserve subsequent module contracts. |
| `mail_reviews` | UUID, draft/snapshot/reviewer FKs | Decision, exact digest, policy version, comments and timestamp. |
| `mail_send_intents` | UUID, unique idempotency key; one noncancelled intent per draft | Approved snapshot/review, schedule, queue state, atomic claim token, attempt counter and provider result. |
| `mail_send_attempts` | UUID, unique `(intent_id, attempt_no)` | Provider, started/final outcome and provider/error identity. Interrupted attempts are retained as uncertain. |
| `mail_audit` | Append ID, mailbox/actor FKs | Action/target and safe metadata, without message bodies. |
| `mail_outbound_switch` | Singleton `id=1` | Audited emergency pause independent of site maintenance. |

The migration only adds tables/indexes and the admin's `mailboxes.admin` grant; it neither imports legacy records nor changes existing system-email, newsletter or Letter Studio tables. Object/message retention remains explicit: there is no automatic deletion of historical sends or private mailbox bytes.

## Void portal internal messaging schema

`apps/portal/db/schema/messaging.ts`, additive migration `20261021124937_noisy_husk.sql` and its generated snapshot:

| Table | Key / constraint | Purpose |
|---|---|---|
| `conversations` | UUID; unique `direct_key`, `department_id`, `project_id` | `kind` direct/department/project. A direct pair has one row (order-independent key); each department and project has at most one channel. `last_message_id` orders the list. |
| `conversation_members` | `(conversation_id, person_id)` | Direct participants, plus a per-person read pointer and mute flag for any conversation. Rows grant nothing by themselves for channels: access is recomputed from department/project rules. |
| `messages` | Autoincrement ID; unique `(author_id, request_id)` | Plain-text body, optional same-conversation reply, `edited_at`, `deleted_at` tombstone (body erased). |
| `message_reactions` | `(message_id, person_id, emoji)` | Toggled reactions, deleted with the message's tombstone. |
| `message_reports` | Autoincrement ID; unique `(message_id, reporter_id)` | Reason, open/dismissed/removed status and resolver. |
| `message_notifications` | Autoincrement ID; unique `(recipient_id, message_id)` | Mention notices, kept separate from the task `notifications` table, whose `project_id`/`task_id` stay NOT NULL. Rows are filtered by current conversation access on read. |
| `notification_preferences` | `(person_id, category)` | In-app switch, email-digest opt-in (default off, not sent) and optional quiet hours for `mentions` and `tasks`. |

The migration only adds tables and indexes, plus the `admin` role's global `chat.moderate` grant. Existing `notifications` rows, columns and queries are unchanged: the new `message_mention` kind lives only in `message_notifications`.

## Portal collaboration migration

The generated additive migrations are `20261018224102_stiff_purple_man.sql` (onboarding), `20261018224557_mature_spacker_dave.sql` (project collaboration) and `20261018224922_bent_living_tribunal.sql` (notifications and meeting follow-through). The project migration includes reviewed data-copy statements that consolidate only existing portal-local department work.

| Change | Purpose |
|---|---|
| `projects.internal` boolean, default false | Keeps existing client publication semantics; internal work never publishes. |
| `projects.legacy_department_project_id`, nullable unique | Resolves IDs from the retained `department_projects` source table after consolidation. |
| `project_tasks.blocked_reason` | Reason required by the API while status is `blocked`, cleared otherwise. |
| `meets.agenda`, `meets.notes` | Manager-edited plain-text follow-through. |
| `meet_action_items` PK `(meet_id, task_id)` | Links existing tasks; cascading parent deletion removes links without granting project access. |
| `notifications` | Recipient/task, kind, actor, optional comment/due date, created/read times, unique `(recipient_id, dedupe_key)` and inbox/task indexes. Task deletion cascades. Retained for 180 days. |
| `onboarding_acknowledgments` PK `(person_id, item)` | First explicit read/dismiss acknowledgments; profile completeness remains derived. |
| `project_files` | Private generated key, project/task scope, filename/type/size/uploader and timestamps. Parent deletion removes metadata. Bytes live under `CLUB_FILES/project-files/`. |
| `project_file_deletions` | Private object key and creation time. `20261018224557_mature_spacker_dave.sql` adds an AFTER DELETE trigger on attachment metadata, including cascades, so primary-byte cleanup survives failed requests and restarts. |

Project stages are `upcoming`, `active`, `on_hold`, `completed`; task statuses are `pending`, `blocked`, `completed`. Existing text columns need no destructive rebuild to accept these values. New department work writes `projects` and `project_departments`, not the frozen source table. A migrated project receives a new canonical ID and retains its source ID separately, avoiding collisions with existing client projects.

## Void portal letters schema

`apps/portal/db/schema/letters.ts`, migration `20261017223322_dapper_redwing.sql`:

| Table | Key | Purpose |
|---|---|---|
| `letter_documents` | UUID, unique private object key | Immutable PDF filename/size, type, non-unique printed reference, explicit access-department FK, JSON string-field snapshot, creator and save time. |
| `letter_sends` | UUID, unique `(created_by, request_id)` | Document FK, recipient, campaign id, durable queued/accepted/failed/uncertain state, provider error, acceptance/save timestamps and actor. |

Campaign ids are not foreign keys: generic email campaigns expire after 30 days while official-document history remains. Required attachment JSON references carry a bucket discriminator so letter PDFs load from `CLUB_FILES`, not newsletter `CASE_STUDIES`. No legacy letter OTP, session or allowlist tables are copied.

## Void portal newsletter schema

ADR-009 uses the portal D1, not the legacy `NEWSLETTER_DB`. Generated migrations `20261017220559_daily_prodigy.sql` and `20261017221325_careful_dormammu.sql` add:

| Table | Key | Purpose |
|---|---|---|
| `newsletter_subscribers` | UUID, unique normalized email, unique unsubscribe token and confirmation hash | `pending`/`active`/`unsubscribed`; name, 48-hour hash/expiry, confirmation time and historical last-unsubscribe time. Only status determines current eligibility. |
| `newsletter_assets` | UUID, unique generated R2 key | Original filename, MIME, byte length, uploader and creation time for source files and posters in `CASE_STUDIES/source/`. |
| `newsletters` | Atomic auto-increment issue number, unique UUID | Title, email subject, summary, sanitized HTML, source/cover asset references, owner/shared flag, optimistic version, current campaign, accepted-recipient count and publication time. Slugs are derived from issue numbers, never a max-slug scan. |

The existing email queue carries immutable snapshots, subscriber-audience metadata and optional required attachment references. No OTP/session/authorized-email tables are added; Google principals and named grants replace them.

## Void portal meets schema

Defined in `apps/portal/db/schema/meets.ts` (migration `20261017072508_vengeful_spencer_smythe.sql`, which also grants the `meets.*` permissions).

| Table | Key | Purpose |
|---|---|---|
| `meets` | `id` | `kind` (`club`, `department`, `inter_department`), title, optional description and link, `scheduled_at` (ISO UTC), creator and creation time. Indexed by kind and schedule. |
| `meet_departments` | `(meet_id, department_id)` | The department of a department meet (exactly one) or the departments of an inter-department meet (one or more). Rows go with their meet. |

## Void portal projects schema

Defined in `apps/portal/db/schema/projects.ts` (initial migration `20261017074729_lucky_shinko_yamashiro.sql`). The collaboration migration above consolidates the portal's department tracker into these tables. The separate legacy Worker's tables are untouched.

| Table | Key | Purpose |
|---|---|---|
| `projects` | `id` | Name, client, description, optional term, deadline, stage (`upcoming`, `active`, `on_hold`, `completed`), internal flag, optional legacy department ID, completion time and creator. |
| `project_departments` | `(project_id, department_id)` | The departments a project belongs to. |
| `project_members` | `id`, unique `(project_id, person_id)` | People named on a project and their role on it. |
| `project_tasks` | `id` | Title, description, assignee, status (`pending`, `blocked`, `completed`), blocked reason, due date, priority, optimistic version, completion and update times. |

A project's departments, members and tasks are deleted with it.

Slice 5b adds `task_comments` in `20261017081155_cheerful_mach_iv.sql`:

| Table | Key | Purpose |
|---|---|---|
| `task_comments` | auto-increment `id`, unique `(author_id, request_id)` | Task FK (cascades on delete), author person FK, client request UUID, plain-text body, creation time and optional deletion time. Deleted bodies are erased. Indexed by task/id for stable 50-row cursor paging. |

Task history uses the existing `audit_log` integer id for cursor ordering. Comment writes and their audit entries share a D1 batch transaction. Deleting a task or project deletes its comments; retained audit history is not exposed once the parent is inaccessible.

## Void portal team instances schema

Defined in `apps/portal/db/schema/team-instances.ts` (migration `20261017211432_fancy_arclight.sql`, which also grants the `team_instances.*` permissions). These replace the legacy `team_instances`, `instance_*` and `instance_team_*` tables; the legacy `level_count` column is gone because the level rows are the ladder.

| Table | Key | Purpose |
|---|---|---|
| `team_instances` | `id` | Name, description, `group_label` (default `Company`), creator and creation time. |
| `instance_departments` | `(instance_id, department_id)` | The departments that run an instance; they decide who can see, run and configure it. |
| `instance_levels` | `(instance_id, position)` | The level ladder, positions from 1, each named. |
| `instance_groups` | `id` | Groups of teams, named by the instance's group label: name, organization, description, sort order. |
| `instance_teams` | `id` | Name, description, optional group (set null when the group is deleted), optional `min_members` and `max_members`, sort order, `current_level`, `status` (`active`, `eliminated`, `winner`). |
| `instance_team_members` | `(team_id, person_id)` | People on a team; one person may be on several teams of an instance. |
| `instance_externals` | `id`, unique `(instance_id, email)` | The instance's register of outside people: name, optional lowercased email, organization. |
| `instance_team_externals` | `(team_id, external_id)` | Outside people on a team. |

Deleting an instance deletes everything in it in one batch; its audit entries stay. Level bounds, sizes and status are validated by the API, and the size cap is enforced inside the writes that could exceed it.

## Void portal email schema

The separate `apps/portal` deployment uses generated, additive Drizzle migrations, not `ensureTables`. Email tables are defined in `apps/portal/db/schema/email.ts`; migration `20261016192957_lazy_captain_flint.sql` also grants global email administration to `admin` and department-scoped sending to `director`.

| Table | Key | Purpose |
|---|---|---|
| `email_queue` | `id` | Campaign template, JSON recipient and attachment-reference arrays, cursor, sent/failed/attempt counters, status, metadata (`meta.replyTo` is the campaign's Reply-To) and timestamps. Indexed by status/created time and status/updated time. |
| `email_deliveries` | `(campaign_id, recipient)` | Per-recipient acceptance by Cloudflare Email Sending, failure or skip, error, attempt count and timestamps. Retained across campaign retries. |
| `email_hour_count` | `hour` (UTC ISO hour) | Shared capacity reservations, incremented atomically before sending; failed attempts release capacity unless Cloudflare may have accepted the message (`OUTCOME_UNKNOWN`). |
| `daily_email_count` | `date` (UTC date) | Successful-recipient reporting, not a daily cap. |
| `dev_outbox` | auto-increment `id` | Capture-mode test records: recipient, sender, subject, HTML, JSON headers (Reply-To) and attachment filenames. `delivered_to` is no longer written since redirect mode was removed. Production routes never expose it. |

Finished campaigns older than 30 days and orphaned delivery rows are removed by the minute drain. The portal starts without legacy `pending_emails` or imported campaigns.

## Important: canonical schema location

The canonical schema and migrations are in `apps/admin-api/index.ts`:

- `ensureTables(db)` — creates all tables with `IF NOT EXISTS`.
- `runMigrations(db)` — adds columns, drops removed tables, and seeds defaults.

`packages/db/schema.sql` is **not authoritative**. It contains destructive `DROP TABLE` statements and does not reflect the runtime schema. Do not run it against any D1 database.

## Entity overview

```text
roles (1) ───< users (N)
users (1) ───< admin_tokens (N) by email
users (1) ───< projects (N) as created_by
users (1) ───< project_roles (N)
projects (1) ───< project_departments (N) >─── departments
projects (1) ───< project_tasks (N)
projects (1) ───< project_roles (N)
departments (1) ───< department_meets (N)
departments (1) ───< department_documents (N)
departments (1) ───< department_instructions (N)
departments (1) ───< department_projects (N)
departments (1) ───< users (N) optional
team_instances (1) ───< instance_departments (N) >─── departments
team_instances (1) ───< instance_teams (N)
instance_teams (1) ───< instance_team_members (N) >─── users
users (1) ───< role_transfers (N) as from/to
newsletters (1) ───< newsletter_subscribers (N) indirect
```

## Tables

### `member_sessions` (reimagined)

Stored in the main `DB`, created idempotently by `ensureTables` during fresh bootstrap and existing-database upgrade. No newsletter schema or existing columns are changed.

| Column | Type / constraint | Meaning |
| --- | --- | --- |
| id | TEXT PRIMARY KEY | Independent session ID, safe for owner-scoped management |
| token_hash | TEXT UNIQUE NOT NULL | SHA-256 of a random 256-bit session credential; raw session credentials are never stored |
| user_id | TEXT NOT NULL, FK users(id) ON DELETE CASCADE | Member identity; deletion removes its device credentials |
| source_token_hash | TEXT NOT NULL | SHA-256 of the issuing registry token; rotation or removal prevents further session use |
| device_label | TEXT NOT NULL | Client-supplied display label, at most 80 characters; not device attestation |
| created_at | DATETIME DEFAULT CURRENT_TIMESTAMP | Creation time |
| expires_at | TEXT NOT NULL | ISO UTC absolute expiry, seven days after issuance |
| revoked_at | TEXT nullable | Revocation time |

`member_sessions_user` indexes `(user_id, revoked_at, expires_at)`. Active listings and issuance limits also require the current source-token hash. Old source sessions may remain as inactive hashed records; retention/cleanup policy is pending. Audit events use `member_session` targets, session IDs and non-secret label/expiry metadata. Session credentials and source-token values must not appear in logs.

### `roles`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PRIMARY KEY | e.g. `chairperson`, `vice_chairperson`, `member`, `advisory` |
| name | TEXT | NOT NULL | Display name |
| power_level | INTEGER | NOT NULL | 100, 50, 30, 10 |
| created_by | TEXT | | `users.id` or `system` |

System-seeded roles:

- `chairperson` (100)
- `vice_chairperson` (100)
- `secretary` (100)
- `co_secretary` (100)
- `technical_director` (100)
- `finance_director` (50)
- `crm_director` (50)
- `operations_director` (50)
- `business_strategy_director` (50)
- `marketing_director` (50)
- `member` (10)
- `advisory` (30)

### `departments`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PRIMARY KEY | e.g. `tech`, `finance`, `crm` |
| name | TEXT | NOT NULL | Display name |
| description | TEXT | | |

Seeded departments: `tech`, `finance`, `crm`, `operations`, `business_strategy`, `marketing`.

### `oauth_states`

Single-use Google OAuth states (created by `ensureTables`).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| state_hash | TEXT | PRIMARY KEY | SHA-256 of the state |
| verifier | TEXT | NOT NULL | PKCE code verifier |
| intent | TEXT | NOT NULL | `login` or `link` |
| user_id | TEXT | | Member being linked (link intent) |
| expires_at | DATETIME | NOT NULL | 10 minutes |

### `oauth_handoffs`

Single-use codes that hand a Google sign-in session to the SPA.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| code_hash | TEXT | PRIMARY KEY | SHA-256 of the code |
| payload | TEXT | NOT NULL | Session JSON |
| expires_at | DATETIME | NOT NULL | 60 seconds |

### `users`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PRIMARY KEY | `lower(hex(randomblob(16)))` |
| name | TEXT | NOT NULL | |
| email | TEXT | UNIQUE, NOT NULL | |
| role_id | TEXT | NOT NULL | FK to `roles.id` |
| department_id | TEXT | | FK to `departments.id` |
| secondary_role_id | TEXT | | Added by migration; currently set to NULL |
| ex_title | TEXT | | Added by migration; advisory/legacy title |
| clerk_user_id | TEXT | UNIQUE (partial, non-empty) | Legacy Clerk user ID; no longer read or written (Clerk removed). Index `idx_users_clerk_user_id` remains |
| google_sub | TEXT | UNIQUE (partial) | Added by migration; linked Google account ID (ID-token `sub`). Index `idx_users_google_sub` |
| oauth_enabled | INTEGER | DEFAULT 0 | Added by migration; 1 if Google sign-in enabled |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

### `admin_tokens`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| token | TEXT | PRIMARY KEY | UUID with dashes removed |
| email | TEXT | UNIQUE, NOT NULL | |
| name | TEXT | | |
| role_id | TEXT | NOT NULL DEFAULT 'member' | FK to `roles.id` |
| created_by | TEXT | | `users.id` or `system` |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |
| revoked_at | DATETIME | | |
| expires_at | DATETIME | | Added by migration |
| active_role_id | TEXT | | Added by migration; currently set to NULL |

### `signup_requests`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PRIMARY KEY | |
| name | TEXT | NOT NULL | |
| email | TEXT | NOT NULL | |
| message | TEXT | | |
| department_id | TEXT | | Added by migration |
| status | TEXT | DEFAULT 'pending' | `pending`, `approved`, `rejected` |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

### `department_meets`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PRIMARY KEY | |
| department_id | TEXT | NOT NULL | FK to `departments.id` |
| title | TEXT | NOT NULL | |
| meet_link | TEXT | | URL |
| description | TEXT | | |
| scheduled_at | DATETIME | NOT NULL | |
| created_by | TEXT | | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

### `department_documents`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PRIMARY KEY | |
| department_id | TEXT | NOT NULL | FK to `departments.id` |
| title | TEXT | NOT NULL | |
| description | TEXT | | |
| file_url | TEXT | | |
| status | TEXT | DEFAULT 'pending' | |
| created_by | TEXT | | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

### `department_instructions`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PRIMARY KEY | |
| department_id | TEXT | NOT NULL | FK to `departments.id` |
| title | TEXT | NOT NULL | |
| content | TEXT | NOT NULL | |
| priority | TEXT | DEFAULT 'medium' | `low`, `medium`, `high` |
| created_by | TEXT | | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

### `department_projects`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PRIMARY KEY | |
| department_id | TEXT | NOT NULL | FK to `departments.id` |
| name | TEXT | NOT NULL | |
| description | TEXT | | |
| status | TEXT | DEFAULT 'upcoming' | |
| deadline | DATETIME | | |
| created_by | TEXT | | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

### `club_meets`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PRIMARY KEY | |
| title | TEXT | NOT NULL | |
| meet_link | TEXT | | |
| description | TEXT | | |
| scheduled_at | DATETIME | NOT NULL | |
| created_by | TEXT | | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

### `inter_dept_meets`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PRIMARY KEY | |
| title | TEXT | NOT NULL | |
| meet_link | TEXT | | |
| description | TEXT | | |
| scheduled_at | DATETIME | NOT NULL | |
| departments | TEXT | NOT NULL | Comma-separated department IDs |
| created_by | TEXT | | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

### `case_studies`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PRIMARY KEY | |
| tag | TEXT | NOT NULL | Category tag |
| title | TEXT | NOT NULL | |
| description | TEXT | NOT NULL | |
| content | TEXT | NOT NULL DEFAULT '' | Added by migration |
| image_url | TEXT | | Added by migration |
| author_name | TEXT | DEFAULT 'Anonymous' | Added by migration |
| created_by | TEXT | | Added by migration |
| source_file_url | TEXT | | Added by migration |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

### `team_members`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PRIMARY KEY | |
| initials | TEXT | NOT NULL | |
| name | TEXT | NOT NULL | |
| role | TEXT | NOT NULL | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

This table is for the public leadership page, not the `users` table.

### `partners`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PRIMARY KEY | |
| name | TEXT | NOT NULL | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

### `announcements`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PRIMARY KEY | |
| title | TEXT | NOT NULL | |
| content | TEXT | NOT NULL | |
| created_by | TEXT | | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

### `role_transfers`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PRIMARY KEY | |
| from_user_id | TEXT | NOT NULL | FK to `users.id` |
| to_user_id | TEXT | NOT NULL | FK to `users.id` |
| role_id | TEXT | NOT NULL | FK to `roles.id` |
| status | TEXT | DEFAULT 'pending' | |
| created_by | TEXT | | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |
| from_user_accepted | INTEGER | DEFAULT 0 | Added by migration |
| to_user_accepted | INTEGER | DEFAULT 0 | Added by migration |

### `projects`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PRIMARY KEY | |
| name | TEXT | NOT NULL | |
| description | TEXT | | |
| company_org | TEXT | | Added by migration |
| year | TEXT | | Added by migration; auto-derived from deadline |
| status | TEXT | DEFAULT 'upcoming' | `upcoming`, `completed` |
| deadline | DATETIME | | |
| created_by | TEXT | | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

### `project_departments`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| project_id | TEXT | NOT NULL | Composite PK, FK to `projects.id` |
| department_id | TEXT | NOT NULL | Composite PK, FK to `departments.id` |

### `project_roles`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PRIMARY KEY | |
| project_id | TEXT | NOT NULL | FK to `projects.id` |
| user_id | TEXT | NOT NULL | FK to `users.id` |
| role_name | TEXT | NOT NULL | |
| created_by | TEXT | | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

### `project_tasks`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PRIMARY KEY | |
| project_id | TEXT | NOT NULL | FK to `projects.id` |
| title | TEXT | NOT NULL | |
| description | TEXT | | |
| assigned_to | TEXT | | FK to `users.id` |
| status | TEXT | DEFAULT 'pending' | `pending`, `completed` |
| created_by | TEXT | | |
| completed_at | DATETIME | | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

### `team_instances`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PRIMARY KEY | |
| name | TEXT | NOT NULL | |
| description | TEXT | | |
| created_by | TEXT | | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

### `instance_departments`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| instance_id | TEXT | NOT NULL | Composite PK, FK to `team_instances.id` |
| department_id | TEXT | NOT NULL | Composite PK, FK to `departments.id` |

### `instance_teams`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PRIMARY KEY | |
| instance_id | TEXT | NOT NULL | FK to `team_instances.id` |
| name | TEXT | NOT NULL | |
| description | TEXT | | |
| member_limit | INTEGER | | Max members |
| min_members | INTEGER | | Added by migration |
| created_by | TEXT | | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

### `instance_team_members`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| team_id | TEXT | NOT NULL | Composite PK, FK to `instance_teams.id` |
| user_id | TEXT | NOT NULL | Composite PK, FK to `users.id` |
| added_by | TEXT | | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

### `rate_limits`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| ip | TEXT | NOT NULL | Composite PK |
| endpoint | TEXT | NOT NULL | Composite PK |
| count | INTEGER | DEFAULT 1 | Atomic consumed attempts, saturated at configured limit + 1 |
| window_start | DATETIME | DEFAULT CURRENT_TIMESTAMP | UTC SQLite timestamp; reused until the configured window expires |

### `audit_log`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PRIMARY KEY | |
| action | TEXT | NOT NULL | |
| actor_email | TEXT | | |
| target_type | TEXT | | |
| target_id | TEXT | | |
| details | TEXT | | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

### `daily_email_count`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| date | TEXT | PRIMARY KEY | ISO date |
| count | INTEGER | DEFAULT 0 | Total delivered recipients that day (all providers); display only, not a hard cap |

### `email_hour_count`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| hour | TEXT | PRIMARY KEY | ISO hour `YYYY-MM-DDTHH` (UTC) |
| count | INTEGER | DEFAULT 0 | Spacemail SMTP messages (50-recipient BCC batches) sent in that hour; capped at 500 |

### `resend_daily_count` (legacy)

No longer created or written: Resend was removed and Spacemail SMTP is the only provider.
The table may still exist in production and can be dropped manually.

### `pending_emails`

Legacy meet-email overflow table. New sends go to `email_queue`; remaining rows are
migrated automatically by the cron drain and can also be flushed via
`POST /api/meets/process-queue`.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PRIMARY KEY | |
| meet_id | TEXT | NOT NULL | |
| meet_type | TEXT | NOT NULL | |
| recipient_email | TEXT | NOT NULL | |
| recipient_name | TEXT | NOT NULL | |
| meet_title | TEXT | NOT NULL | |
| meet_description | TEXT | | |
| meet_link | TEXT | | |
| scheduled_at | TEXT | | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

### `email_queue`

Bulk-email campaigns. One row per campaign (newsletter, event, meet notification, or Send
Mail list); the `* * * * *` cron drains it with adaptive pacing (up to 15 messages/minute).
Every kind is sent one message per recipient, 1.5 s apart, and tracked in
`email_deliveries`. Newsletter/event `html` contains
the `%%UNSUBSCRIBE_URL%%` marker, replaced per recipient with their tokenized link.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PRIMARY KEY | |
| kind | TEXT | NOT NULL | `newsletter` / `event` / `meet` / `test` |
| from_address | TEXT | NOT NULL | From header |
| subject | TEXT | NOT NULL | |
| html | TEXT | NOT NULL | Pre-rendered shared body |
| attachments | TEXT | | JSON `[{filename,key,contentType}]` (R2 references) |
| recipients | TEXT | NOT NULL | JSON array of addresses |
| cursor | INTEGER | DEFAULT 0 | Next unsent index in `recipients` |
| total | INTEGER | NOT NULL | Recipient count |
| sent | INTEGER | DEFAULT 0 | Delivered count |
| failed | INTEGER | DEFAULT 0 | Failed count |
| attempts | INTEGER | DEFAULT 0 | Claim attempts (max 5) |
| status | TEXT | DEFAULT 'pending' | `pending` / `processing` / `done` / `failed` |
| last_error | TEXT | | Last delivery error |
| meta | TEXT | | JSON, e.g. `{"newsletter_id":"..."}` or `{"meet_id":"..."}` |
| created_by | TEXT | | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Claim/stale detection |
| finished_at | DATETIME | | Set when done/failed |


### `email_deliveries`

Per-recipient delivery record for single-recipient queue campaigns (everything except
`meet`). The drain skips recipients already `sent`/`skipped`, so a reclaimed or retried
campaign never mails the same address twice. Rows are purged with their campaign.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| campaign_id | TEXT | PK (with recipient) | `email_queue.id` |
| recipient | TEXT | PK (with campaign_id) | |
| status | TEXT | NOT NULL | `sent` / `failed` / `skipped` (subscriber unsubscribed after enqueue) |
| error | TEXT | | Last failure reason |
| attempts | INTEGER | DEFAULT 0 | |
| sent_at | DATETIME | | |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |
### `consulting_requests`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PRIMARY KEY | |
| name | TEXT | NOT NULL | |
| email | TEXT | NOT NULL | |
| phone | TEXT | NOT NULL | |
| organization | TEXT | NOT NULL | |
| role_in_org | TEXT | | |
| requirement | TEXT | NOT NULL | |
| status | TEXT | DEFAULT 'pending' | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

### `consulting_responses`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PRIMARY KEY | |
| request_id | TEXT | NOT NULL | FK to `consulting_requests.id` |
| email_subject | TEXT | NOT NULL | |
| email_body | TEXT | NOT NULL | |
| sent_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

### `maintenance_mode`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | INTEGER | PRIMARY KEY DEFAULT 1 | Single-row table |
| enabled | INTEGER | DEFAULT 0 | |
| message | TEXT | DEFAULT 'Site is under maintenance...' | |
| updated_by | TEXT | | |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

> **Database split:** `newsletter_subscribers`, `newsletters`,
> `newsletter_authorized_emails`, `newsletter_otp_codes`, and `newsletter_sessions` live in
> the separate `newsletter-db` D1 database (`NEWSLETTER_DB` binding). The copies in
> `180dc-db` are frozen legacy backups — never write to them. Schemas are identical and
> created by `ensureNewsletterTables`.

### `newsletter_subscribers`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PRIMARY KEY | |
| email | TEXT | UNIQUE, NOT NULL | |
| active | INTEGER | DEFAULT 1 | |
| subscribed_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |
| unsubscribed_at | DATETIME | | |
| name | TEXT | | Optional, from the subscribe request (migration) |
| unsubscribe_token | TEXT | UNIQUE index | 48-hex random token for `/unsubscribe/:token`; backfilled for existing rows (migration) |
| confirm_token_hash | TEXT | | Added by migration; SHA-256 of the pending double opt-in token, cleared on confirm |
| confirm_expires_at | DATETIME | | Added by migration; confirmation link expiry (48 hours) |

### `newsletters`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PRIMARY KEY | |
| title | TEXT | NOT NULL | |
| description | TEXT | DEFAULT '' | |
| content | TEXT | DEFAULT '' | |
| source_file_url | TEXT | | |
| image_url | TEXT | | |
| sent_at | DATETIME | | |
| recipient_count | INTEGER | DEFAULT 0 | |
| email_subject | TEXT | | Added by migration |
| created_by | TEXT | | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

### `newsletter_authorized_emails`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| email | TEXT | PRIMARY KEY | |
| added_by | TEXT | | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

### `newsletter_otp_codes`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PRIMARY KEY | |
| email | TEXT | NOT NULL | |
| code | TEXT | NOT NULL | |
| expires_at | DATETIME | NOT NULL | |
| used | INTEGER | DEFAULT 0 | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

### `newsletter_sessions`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PRIMARY KEY | Session token |
| email | TEXT | NOT NULL | |
| expires_at | DATETIME | NOT NULL | 24h expiry |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

### `letter_authorized_emails`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| email | TEXT | PRIMARY KEY | |
| added_by | TEXT | | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

### `letter_otp_codes`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PRIMARY KEY | |
| email | TEXT | NOT NULL | |
| code | TEXT | NOT NULL | |
| expires_at | DATETIME | NOT NULL | |
| used | INTEGER | DEFAULT 0 | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

### `letter_sessions`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PRIMARY KEY | Session token |
| email | TEXT | NOT NULL | |
| expires_at | DATETIME | NOT NULL | 24h expiry |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

### `letters_sent`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PRIMARY KEY | |
| docnum | TEXT | | Ref. No. e.g. `180DC-XXXX` |
| doc_type | TEXT | | appointment, promotion, ... |
| member_name | TEXT | | |
| recipient_email | TEXT | NOT NULL | |
| file_key | TEXT | | R2 key under `letters/` in CLUB_FILES |
| created_by | TEXT | | Letter Studio session email |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

## Migrations applied at runtime

`runMigrations` in `apps/admin-api/index.ts` performs the following idempotent changes:

- Adds `from_user_accepted` and `to_user_accepted` to `role_transfers`.
- Adds `department_id` to `signup_requests`.
- Adds `company_org` and `year` to `projects`.
- Adds `expires_at` and `active_role_id` to `admin_tokens`.
- Adds `content`, `image_url`, `author_name`, `created_by`, `source_file_url` to `case_studies`.
- Adds `email_subject` to `newsletters`.
- Adds `min_members` to `instance_teams`.
- Adds `secondary_role_id`, `ex_title`, `clerk_user_id`, `oauth_enabled` to `users`.
- Creates partial unique index `idx_users_clerk_user_id` on `users(clerk_user_id)` where non-empty (legacy).
- Adds `google_sub` to `users` with partial unique index `idx_users_google_sub`; adds `confirm_token_hash`, `confirm_expires_at` to `newsletter_subscribers`.
- Deletes old seed case studies that lack content.
- Clears stale rate-limit rows for removed endpoints.
- Drops recruitment tables if they still exist.
- Seeds `maintenance_mode` row `(1, 0, default message)`.
- Creates newsletter tables if missing.
- Creates letter studio tables (`letter_authorized_emails`, `letter_otp_codes`, `letter_sessions`, `letters_sent`) if missing.

## Indexes and constraints

Most primary and unique constraints are declared inline in `CREATE TABLE`. There are no explicit secondary indexes defined in `ensureTables`; D1/SQLite automatically indexes primary keys. If query performance degrades, add indexes carefully with `IF NOT EXISTS` in `runMigrations`.

## R2 metadata

The `CLUB_FILES` bucket uses custom metadata to store file metadata instead of a D1 table:

- `fileName`
- `fileType`
- `uploadedBy`
- `uploadedByName`
- `createdAt`
- `eventName`
- `eventFor`
- `projectName`
- `meetingTitle`
- `meetingDate`
- `description`

This is a design choice; if you add a D1 table for club files, keep the R2 metadata in sync or migrate it.

## Letter Studio R2 usage

Generated letter PDFs are stored in the `CLUB_FILES` bucket (`180dc-club-files`) under the `letters/` folder with keys like `letters/<docnum>-<uuid>.pdf` and `application/pdf` content type. Uploaded via `POST /api/letter-studio/upload` (letter session auth) and read back by `POST /api/letter-studio/send` for email attachments.

### Shared library R2 key boundary (reimagined)

Existing shared file objects remain flat `<category>/<id>.<extension>` keys with their existing custom metadata. Only `general`, `projects` and `events` categories are reachable through Club Files. Letter Studio and nested/private namespaces remain outside that API. Shared `projectName` metadata is display-only, not a project foreign key or private resource scope. Contextual attachment metadata/schema is still pending and must be added idempotently to the canonical Worker schema.

`project_tasks` now has nullable `due_date TEXT` containing an explicit calendar date (`YYYY-MM-DD`) and `priority TEXT NOT NULL DEFAULT 'normal'`. Existing rows migrate to no task date and normal priority. Both runtime `ensureTables` and idempotent `runMigrations` define these additive fields. They do not repurpose `projects.deadline` or `completed_at`. Schedule edits append before/after JSON to the existing audit log transactionally.

Task reassignment uses existing `project_tasks.assigned_to`; no extra table/column is added. Combined changes audit owner/date/priority before/after in `audit_log` using action `task_details_changed`. The owner must exist, have an active registry credential, and have board/department/explicit-role project access when assigned. Clearing the owner stores SQL null.

Task timelines read the existing `audit_log`. An idempotent `idx_audit_task_history(target_type, target_id, created_at)` index supports scoped reads. SQLite append row sequence breaks same-second ties and is carried only in the opaque pagination cursor. Database migration/export must preserve this order or translate it to an explicit append sequence. No historical audit data is backfilled.
