# Data Model — 180DC VIT Chennai Platform

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
| clerk_user_id | TEXT | UNIQUE (partial, non-empty) | Added by migration; Clerk user ID. Enforced by `idx_users_clerk_user_id` (`WHERE clerk_user_id IS NOT NULL AND clerk_user_id != ''`) |
| oauth_enabled | INTEGER | DEFAULT 0 | Added by migration; 1 if Clerk login enabled |
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
| count | INTEGER | DEFAULT 1 | |
| window_start | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

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
- Creates partial unique index `idx_users_clerk_user_id` on `users(clerk_user_id)` where non-empty.
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
