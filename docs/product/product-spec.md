# Product specification - 180DC VIT Chennai portal

## Production scope

`apps/portal` is the live public site and members portal at `180dc.vitcc.org`. It uses Void, one D1 database, R2 files and the existing minute email queue. The old Worker and frontend remain deployed only for rollback. Their behavior is described in [legacy-product-spec.md](legacy-product-spec.md), not as a roadmap for this app.

The portal launched with blank data. Importing old personnel, content or R2 objects remains a separately planned operation; do not import old credentials or sessions.

## People and access

- Google-only sign-in, gated by a personnel record with the same verified email.
- An authorized person adds a member through Invite or CSV import. The invitation and any initial tenure are saved atomically with a queued invitation email. No password, registry token or separate newsletter OTP is issued.
- First sign-in activates an invited person. Active and on-leave people retain access; alumni and removed people do not.
- A first-login checklist helps a member review their profile, department and resources without blocking ordinary work or requiring optional private details.
- Titles and tenures describe the organization; named roles and personal grants control permissions. Department-scoped grants do not grant access to other departments.
- Directory, profiles, lifecycle management, positions, terms, CSV import/export and audit records support annual handovers.

## Everyday work

- Today shows open assigned work, including blocked tasks and reasons, due dates and priority, relevant upcoming meets, recent announcements and scoped attention counts. Task retrieval is bounded after applying authorization and ordering.
- Projects use one workspace for client and internal department work: details, departments, members, tasks, comments, history and contextual attachments. Stages are upcoming, active, on hold and completed.
- Internal projects never enter the public completed-project list. Existing client-project publication behavior is retained. Converting internal work to publishable work requires project-management permission, not merely department-workspace management.
- Internal work retains the department workspace audience: leads/workspace readers and explicitly named project members. Ordinary department membership alone does not reveal migrated supervisor-only records.
- Tasks are pending, blocked or completed. Blocking requires a reason; status changes retain the optimistic version check. Members update their own assigned tasks; authorized managers manage tasks.
- A small inbox records assignments, comments and upcoming deadlines. Only the recipient can mark a notification read, and current project access is checked before exposing its content.
- Department pages link to the same projects filtered by department. Existing portal department-tracker records are copied additively into internal projects, and old routes remain compatible. The old table is retained, not dropped.
- Meets retain their club/department/inter-department audiences and 24-hour post-meeting link visibility. Managers edit agendas and notes and link existing project tasks as action items. A meeting never grants access to a linked project.
- Private project/task attachments inherit project visibility and management permissions. Shared club files remain a separate explicitly shared library.
- Team instances retain staffing, groups, progression, outside participants and capacity rules. Roster is the default view; advanced views remain available.

## Publishing and communications

- Public pages cover the chapter, team, case studies, partners, completed client projects, gallery, consulting requests and The Catalyst newsletter.
- Consulting requests are reviewed by authorized personnel with a recorded accept/reject decision and an honest email-send result.
- Newsletter subscriptions require email confirmation; unsubscribe uses personal links and mail-client one-click requests. Google personnel permissions govern editing, sending and subscriber administration.
- Newsletters support private/shared drafts, source uploads, self-tests, broadcasts, events and an archive of successfully broadcast issues.
- Letter Studio supports the existing 13 templates, private immutable saved PDFs, separate print/download/email actions and durable accepted/failed/uncertain send history.
- Cloudflare Email Sending is the only portal mail transport. Direct and queued mail share the configured hourly allowance; daily counts are reporting, not a 100-per-day cap. Queued means accepted for processing, not delivered to an inbox.

## Operations and boundaries

- Additive Drizzle migrations define portal schema changes. Keep generated SQL and snapshots together.
- The daily backup job includes `180dc-portal-db` as well as both legacy databases and the named R2 buckets. Offline restore verification and the approval boundary for live recovery are in [BACKUP_B2.md](../operations/BACKUP_B2.md).
- R2 is used directly unless optional B2 failover credentials are configured. Existing configured failover remains supported; no additional storage service is required for new features.
- Tests capture mail. Production deployment, live sending, resource changes, legacy import and retiring the rollback Worker are separate actions.
- No real-time chat, AI chatbot, new microservice, native-client feature expansion or recruitment system is part of these changes.

Implementation details: [portal README](../../apps/portal/README.md), [API contracts](../contracts/api-contract.md), [business logic](../domain/business-logic.md), [data model](../contracts/data-model.md), and [portal execution plan](../execution/portal-port-plan.md).
