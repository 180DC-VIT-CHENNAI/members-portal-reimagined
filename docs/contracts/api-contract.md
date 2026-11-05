# API Contract — 180DC VIT Chennai Platform

## Void portal CRM

Every route needs a personnel session and `crm.view` (403 otherwise). Records the caller cannot see are 404 (`organization_not_found`, `opportunity_not_found`, `contact_not_found`, `proposal_not_found`, `engagement_not_found`) and are excluded from every list, search and count; known-but-forbidden changes are 403. Writes need `crm.manage` plus edit access on the record and share a 300/hour `crm_write` limit. Reads are private/no-store.

- `GET /api/crm/summary`: `{stages, counts}`; counts per stage of visible opportunities only.
- `GET /api/crm/stages`; `POST /api/crm/stages` `{id, label, kind?, sortOrder?, active?}` and `PATCH /api/crm/stages/:id`: `crm.admin`. Won/lost stages cannot be retired.
- `GET /api/crm/organizations?q=`: visible, unmerged organisations (max 200). `POST`: `crm.manage`; `{name, website?, industry?, geography?, tags?, lifecycle?, source?}` returns 201 `{id}`, or 409 `{error: 'duplicate_organization', id}` when a visible organisation has the same normalised domain (an invisible one is never revealed).
- `GET|PATCH /api/crm/organizations/:id`: detail with contacts (private fields only with organisation access), opportunities, touchpoints, engagements and `access`. Changing `ownerId` needs grant rights; the new owner must have `crm.view`.
- `POST /api/crm/organizations/:id/contacts`, `POST /api/crm/organizations/:id/opportunities` (`primaryContactId` must belong to that organisation).
- `GET|POST|DELETE /api/crm/{organizations|opportunities|contacts}/:id/access`: owner (or co-owner grant) and `crm.admin` only; `{personId, role?: 'collaborator'|'owner'}`. Grantees must have `crm.view`.
- `GET /api/crm/contacts?q=`: contacts whose private fields the caller may read. `GET|PATCH /api/crm/contacts/:id`.
- `GET /api/crm/opportunities?q=`; `GET|PATCH /api/crm/opportunities/:id`; `POST .../stage` `{stageId, lostReason?, lostNote?}` (lost needs a reason code; won only through proposal acceptance; won is final).
- `GET /api/crm/next-steps`: the caller's own open opportunities with a next step due today or earlier (UTC), with `overdue`.
- `POST /api/crm/touchpoints` `{kind: meeting|email|call|note|milestone, organizationId?|opportunityId?, contactId?, summary, notes?, externalRef?, occurredAt}`; email requires `externalRef` and rejects `notes`.
- `POST /api/crm/opportunities/:id/proposals` `{title, scope, objectives?, timeline?, deliverables?}`; `POST /api/crm/proposals/:id/versions` freezes earlier versions and returns to draft; `POST .../status` `{status: 'sent'|'declined'}`; `POST .../accept` `{departmentIds, leadId, confidentiality?, deadline?}` returns 201 `{engagementId, projectId}` (also needs project-manage rights; 409 when not sent or already engaged).
- `GET /api/crm/engagements`, `GET /api/crm/engagements/:id`, `PATCH .../closeout` (checklist, feedback, case-study consent), `POST .../close` returns `{closed, caseStudyDraftId}`.
- `GET /api/crm/duplicates`, `POST /api/crm/organizations/:id/merge` and `POST /api/crm/contacts/:id/merge` `{sourceId}`: `crm.admin`.
- `POST /api/consulting-requests/:id/convert`: `consulting.manage` and `crm.manage`; `{organizationId, contactId, opportunityId, created}`; `created` is true only the first time, later calls return the same ids.
## Void portal member lifecycle

Google personnel session on every route. Hidden people/proposals/items are 404; a known but forbidden action is 403.

- `GET /api/people/:id/status`: status history, oldest first (`fromStatus, toStatus, reason, effectiveOn, actorPersonId, createdAt`); the person or `people.lifecycle` for their department. `POST` additively accepts `reason?` (or the older `note?`) and `effectiveOn?: YYYY-MM-DD` (default today; a future date is 400).
- `GET /api/people/:id` adds `memberships` (secondary departments), `tenures[].reportsToPersonId` and `accessReviews` (open reviews; only for viewers who see grants). `GET /api/people?department=` also matches secondary memberships in force today.
- `POST /api/people/:id/memberships`: `people.edit` for the secondary department; `{departmentId, note?, validFrom?, validUntil?}` returns 201. Primary department is 400; an open duplicate is 409. `DELETE .../memberships/:membershipId` ends it today and keeps the row.
- `GET /api/promotions?person=&status=`: proposals the viewer may see (the person, the proposer, `people.edit` or `people.promotions.approve` holders for the position), each with `canDecide` and `canWithdraw`. `GET /api/promotions/:id` is 404 when not visible.
- `POST /api/promotions`: `people.edit` for the position's department (else the person's); `{personId, positionId, termId?, startsOn?, rationale, letterDocumentId?}` returns 201 with `status: 'pending'`.
- `POST /api/promotions/:id/decision`: `{action: 'approve'|'reject'|'withdraw', note?}`. Approve/reject need `people.promotions.approve` for the position; the proposer and the person concerned get 403. Withdraw is the proposer's. Approval returns `{status: 'approved', tenureId}` and creates the tenure, an open access review, a `promotion` email-queue campaign to the person and an audit entry; access roles and grants are unchanged. A decided proposal is 409.
- `GET /api/access-reviews?status=&person=`: `people.grants`. `POST /api/access-reviews/:id/review` closes one; your own is 403.
- `PATCH /api/tenures/:id`: `{reportsToPersonId: string|null}`, `people.edit` for the position; a cycle in that term is 400.
- `GET /api/org-chart?term=`: `people.view`; the term's tenures with position, holder and `reportsToPersonId` (current term by default).
- `GET /api/people/:id/offboard`: `people.offboard` for the person's department; `{status, steps: [{key, label, count, items}], needsSuccessor, records}`. `POST` `{status: 'alumni'|'removed', successorId?, reason, effectiveOn?, handover?: [{item, done}]}` returns `{id, status, changed, summary: {tasks, projects, tenures, grants, sessions, mailboxes, crm}, recordId}`. The `crm` step moves owned CRM organisations/opportunities, engagement owner/lead roles and owner-role record grants to the successor and deletes the leaver's CRM record grants, with audit entries. Yourself, an inactive successor or a missing successor when work exists is 400. Re-running returns `changed: false` and writes nothing.
- `GET/POST /api/onboarding/policies`, `PATCH /api/onboarding/policies/:id` (`active: false` retires): `onboarding.manage`. Active policies appear in `GET /api/onboarding` and are acknowledged through the existing acknowledgment route.
- `GET /api/terms/:id/handover`: `terms.manage` sees every item, others only their own. `POST` `{title, ownerPersonId?}` and `DELETE /api/handover-items/:id`: `terms.manage`. `PATCH /api/handover-items/:id` `{done?, title?, ownerPersonId?}`: owners may only tick; others' items are 404.

New permission keys: `people.promotions.approve` and `people.offboard` (admin global, director department), `onboarding.manage` (admin).

## Void portal documents and knowledge

`:fileId` is a project/task file ID or a shared club-file ID. Each route first resolves the existing file ACL (project access or `files.view`), so an inaccessible or unknown ID returns 404. Mutations need project task management or `files.manage` (403 otherwise). Reads are private/no-store.

- `GET /api/documents/:fileId/versions`: `{document, versions, canManage}`, at most 100 versions, newest first. `POST` (manage, multipart `file`, 30/hour, 25 MiB shared-file policy) returns 201 `{id, number, checksum}`. A concurrent revision change is 409 `version_changed`, and an archived document is 409.
- `GET .../versions/:versionId/download`: the specific version as an attachment. `POST .../versions/:versionId/restore` (manage) returns 201 with a new version copied from it.
- `PATCH /api/documents/:fileId/retention` (manage): `{retentionUntil: YYYY-MM-DD|null, legalHold, archived?, reviewStatus?: pending|approved|rejected}`. Audited.
- `GET /api/documents/:fileId/shares`: the caller's links (managers see all). `POST` (30/hour) takes `{expiresAt: ISO within 30 days, maxDownloads?: 1..100000|null, requireSignIn?}` and returns 201 `{id, url, expiresAt}`. The URL contains the only copy of the token. `DELETE .../shares/:shareId` revokes the link. Creation and revocation are audited.
- `GET /api/document-shares/:token`: public, 60/minute. Returns the frozen version as an attachment (`private, no-store`, nosniff, sandbox CSP), or 404 for malformed, unknown, revoked, expired, over-limit, archived, creator-lost-access, or (when sign-in is required) unauthenticated requests.
- `DELETE /api/projects/.../files/:fileId` and `DELETE /api/club-files/:id` return 409 `legal_hold` while a hold is set. Deleting a parent task or project also returns 409 when any affected attachment is held.
- `GET /api/knowledge?search=&before=<id>`: `knowledge.view`, 50 readable articles (descending ID) plus `nextBefore`. Search matches title and body only within readable rows. 60/minute.
- `POST /api/knowledge`: `knowledge.edit` for the scope. `{title, slug, body, scope: global|department, departmentId?, status, tags?, projectId?, taskId?, meetId?}` returns 201 `{id, revision}`. A non-draft status requires `knowledge.publish`. A duplicate slug is 409. An inaccessible department or linked resource is 404.
- `GET /api/knowledge/:id`: an article with `renderedBody` (escaped HTML), `canEdit` and `canPublish`. Unreadable articles are 404. `PUT` takes the same body plus `revision`. A stale revision is 409, and so is a scope change.
- `GET /api/knowledge/:id/revisions`: `knowledge.edit`, at most 100 snapshots.

## Void portal shared mailboxes

These routes use the current Google personnel session and mailbox-local capabilities, not titles or the global `email.send` permission. An inaccessible mailbox/object is 404; a forbidden operation on a readable mailbox is 403. Read responses are private/no-store.

- `GET /api/mailboxes`: `{mailboxes: [{mailbox}]}`, at most 100 assigned mailboxes. Platform administrators do not receive universal inbox visibility.
- `POST /api/mailboxes`: global `mailboxes.admin`; `{address, displayName, managerId, purpose?}` returns 201 `{id}`. The manager must be another invited/active/on-leave person. Creates a disabled transport and an explicit `mailbox.manage` grant, no DNS or mailbox-provider resource. 20/hour.
- `GET /api/mailboxes/:id`: mailbox definition and the caller's current capabilities.
- `PATCH /api/mailboxes/:id`: `mailbox.manage`; optional `status`, `outboundAdapter`, `approvalRequired`, `requireDistinctReviewer`, `repliesOnly`, `signature`, `outboundPaused`, `categoryPolicy`. A change increments the policy version; old approvals cannot dispatch. Capture transport is development-only. Approval remains mandatory for this initial policy.
- `GET /api/mailboxes/:id/members`: `mailbox.manage`, bounded capability rows with member names. `PUT .../members/:personId` replaces explicit `{capabilities, validUntil?}`; `DELETE` removes them. Managers or global mailbox administrators may change another person's grants, never their own. Grants do not imply each other. 60 management requests/hour.
- `GET /api/mailboxes/:id/drafts?before=<id>`: `mailbox.read`, 50 rows descending by ID; pass the last ID to read the next page. `POST` requires `mailbox.draft.create` and accepts `{to: string[], cc?: string[], bcc?: string[], subject, text, attachmentIds?, category?}`; returns 201 `{id, revision: 1}`. At most 50 distinct addresses across To/CC/BCC. Arbitrary From, conversation and object-key fields are rejected.
- `GET .../drafts/:draftId`: current frozen snapshot plus review history. `PATCH` accepts the creation fields plus the expected `revision`; own/any editing capabilities apply. Returns a new revision, invalidates approval and cancels unsent queued/scheduled intents; stale edits or terminal states are 409. `DELETE` cancels an editable draft/intent and refuses one already sending.
- `POST .../drafts/:draftId/submit`: `{revision}`, `mailbox.draft.submit`; own drafts or explicit edit-any capability.
- `POST .../drafts/:draftId/review`: `{revision, decision: 'approved'|'changes_requested'|'rejected', comments?}`. Requires review; approval additionally needs approve and send. The submitted revision, digest and mailbox-policy version are bound to the review. A distinct reviewer is required by default.
- `POST .../drafts/:draftId/send` or `/schedule`: `{revision, idempotencyKey, scheduledAt?: ISO timestamp|null}`, `mailbox.send`. Requires current approval; returns `{id, state}` for a durable intent, not provider acceptance. Idempotency keys are 8–128 ASCII letters/digits/underscore/hyphen. Identical completed submissions return the same intent; conflicts and duplicate active sends are 409.
- `GET /api/mailboxes/:id/sends/:intentId`: `mailbox.read`, intent and at most 50 attempts. The minute cron revalidates approvals, current sender/reviewer/author grants, person/mailbox status, pause switches and attachment bytes before an atomic claim. Uncertain outcomes are never automatically retried.
- `POST /api/mailboxes/:id/attachments`: multipart `file`, `mailbox.draft.create`, 30/hour; approved shared-file extensions, at most 3 MiB raw attachments per message. Returns `{id, filename, bytes, digest}`. `GET .../attachments/:fileId` requires mailbox read and exact mailbox/file ownership; attachment-only, private/no-store, nosniff.
- `GET /api/mailboxes/:id/audit?before=<positive integer>`: `mailbox.audit`, 50 metadata-only events, descending ID. Audit capability does not grant body access.
- `GET`/`PUT /api/admin/mail-outbound`: global `mailboxes.admin`; `{paused: boolean}` emergency shared-mail switch, independent of portal maintenance.

Draft writes are limited to 60/hour, workflow actions to 100/hour, draft lists to 120/minute. Existing `/api/send-email`, letters and newsletters retain their own permissions and `noreply` identity; mailbox drafting never grants a bypass into those routes.

## Void portal email templates

All routes use the current Google personnel session. A template is visible only when the caller holds at least one action on it (global/department `templates.*` grants, or for mailbox-owned templates the mailbox capabilities `mailbox.manage` / `draft.create` / `review` / `send`, narrowed by the template's `policy`); otherwise 404. A visible template with a missing action is 403. Reads are private/no-store. Template writes share 60/hour.

- `GET /api/email-templates?before=<id>`: `{templates: [{template, actions, category}], nextBefore}`, 50 per page, authorized row by row before paging.
- `POST /api/email-templates`: `{name, ownerScope: 'global'|'department'|'mailbox', ownerId (null for global), definition}`; needs `author`. Returns 201 `{id, versionId, version: 1}` with status `draft`. `definition` is `{fields: [{key, label, type, required?, example?, options?, min?, max?}], subject, body, signature?, allowedMailboxIds (1-20), allowedRecipients?, category?, policy?: {action: personId[]}, followupDays?}`. The caller must manage every allowed mailbox (404 unknown, 403 not manager); a mailbox template must allow its owner mailbox. Unknown or reserved variables, duplicate keys, malformed `{{` and extra properties are 400.
- `GET /api/email-templates/:id`: `{template, latest, actions, versions}`.
- `POST /api/email-templates/:id/versions`: `{version, definition}`; needs `edit`. `version` is the current latest; a stale value is 409, a retired template 409. Returns 201 `{id, versionId, version}`.
- `POST /api/email-templates/:id/status`: `{version, action: 'publish'|'retire'}`; needs that action. Publishing sets the latest version as the published version; retiring is final. Stale version or retired template is 409.
- `GET /api/mailboxes/:id/templates`: `mailbox.draft.create`; `{templates: [{id, name, versionId, version, definition}]}` for published versions that allow this mailbox and on which the caller has `draft`.
- `POST /api/mailboxes/:id/templates/preview`: `{versionId, values, to?}`; needs template `draft` and `mailbox.draft.create` on an active mailbox. Returns `{subject, text, html, signature, warnings, attachmentIds, to, category, versionId, version, templateName}`. Disallowed mailbox/recipient or category is 400; unverified CRM contact is 400. 300/hour.
- `POST /api/mailboxes/:id/templates/drafts`: same body; the version must be the published one (409) and there must be no warnings (400). Creates a mailbox draft pinned to `versionId`, returns 201 `{id, revision: 1}`.
- `POST /api/mailboxes/:id/templates/test`: `{versionId, values}` (no recipients accepted); queues one system-queue message to the caller's own address, returns `{campaignId, queued: 1}`. Outbound pause (mailbox or global) is 409. 10/hour.
- `GET /api/mailboxes/:id/templates/starters`: `mailbox.manage`; `{starters: [{id, name, definition}]}` eleven recipes, not templates.
- `GET /api/mailboxes/:id/templates/reminders`: `mailbox.draft.create`; `{reminders: [{draftId, subject, templateId, sentAt, to}]}` for the caller's accepted sends from published templates whose `followupDays` elapsed. Suggestions only.

Mailbox draft `PATCH`, `submit`, `review` and `send` on a template-pinned draft additionally require the pinned version's `draft`, `review` (and `send` for approval) or `send` action, the version's mailbox/recipient rules, and a non-retired template (409 `template_retired`).

## Void portal internal messaging

All routes use the current Google personnel session. A conversation the caller cannot read now is 404 on every route (detail, messages, people, read, mute, send, edit, delete, react, report), whether or not it exists. Responses are private/no-store. Reads share a 240/minute limit, writes 60/minute, search 30/minute, reports 10/minute.

- `GET /api/messages/conversations`: `{conversations}` the caller can read, at most 100, newest activity first. Each has `{id, kind: 'direct'|'department'|'project', title, departmentId, projectId, counterpartId, lastMessageId, lastAt, lastBody, unread, unreadCapped, muted, canSend}`. Channels appear once they have a message; direct conversations always appear.
- `GET /api/messages/unread`: `{unread, capped}` across readable, unmuted conversations, capped at 99.
- `POST /api/messages/direct`: `{personId}`, returns `{id}` for the single direct conversation with another current active/on-leave member. Self is 400; anyone else is 404.
- `POST /api/messages/channels`: `{departmentId}` or `{projectId}`, returns `{id}` for that context's channel (created on first open) if the caller may read it, else 404.
- `GET /api/messages/conversations/:id`: the conversation from the caller's view. `canSend` is false for a direct conversation whose other person has left.
- `GET /api/messages/conversations/:id/people`: up to 200 current readers, for the mention picker.
- `GET /api/messages/conversations/:id/messages?before=<id>`: `{messages, nextBefore}`, 50 per page, newest first. Deleted messages remain as `{deleted: true, body: null, reactions: []}`. Replies carry a 140-character `replyTo.preview` (null once deleted).
- `POST /api/messages/conversations/:id/messages`: `{requestId: uuid, body: 1-4000 chars, replyToId?}`, returns 201 `{id, replayed}`. A repeated `requestId` with the same content returns the first message; with different content it is 409. Sending to a read-only conversation is 409.
- `PATCH /api/messages/conversations/:id/messages/:messageId`: `{body}`. Own message only (403 otherwise), within 15 minutes of sending (`edit_window_closed` 409), never after deletion (409). Newly mentioned readers are notified.
- `DELETE /api/messages/conversations/:id/messages/:messageId`: own message only (403 otherwise). Leaves a tombstone.
- `POST .../messages/:messageId/reactions`: `{emoji}` from a fixed set of six; toggles the caller's reaction and returns `{reactions}`.
- `POST .../messages/:messageId/report`: `{reason: 1-500 chars}`. You cannot report your own message (400) or a deleted one (409); repeat reports are a no-op.
- `POST /api/messages/conversations/:id/read`: `{upTo}` moves the caller's read pointer forward (never back) and marks that conversation's mention notices read.
- `PUT /api/messages/conversations/:id/mute`: `{muted: boolean}`. Muted conversations leave the nav badge and receive no mention notices.
- `GET /api/messages/search?q=<2-100 chars>&before=<id>`: `{results, nextBefore}`, 30 live messages from readable conversations, case-insensitive substring match.
- `GET /api/messages/reports` and `POST /api/messages/reports/:id` with `{action: 'dismiss'|'remove'}`: global `chat.moderate`. Moderators see only the reported message and where it was posted. Removal tombstones the message and writes an audit entry with no text.
- `GET /api/notifications/mentions?before=<id>&unread=1`: `{mentions, nextBefore}`, 30 per page, rechecking conversation access and that the message is live. `POST /api/notifications/mentions/read` accepts `{ids}` (1-50) or `{upTo}` for the caller's own notices only. `GET /api/notifications/count` now includes readable unread mentions.
- `GET`/`PUT /api/notification-preferences`: `{preferences: [{category: 'mentions'|'tasks', inApp, emailDigest, quietStart, quietEnd}]}`. Quiet hours are `HH:MM` in India time; set both to different times or leave both null. The start is inclusive, the end exclusive, and overnight windows are supported. `GET /api/notifications/count` excludes categories that are quiet now or have in-app notices disabled. Inbox lists remain accessible and unread; pending notices count again when quiet hours end. Defaults are in-app on and digest off. No digest email is sent.

## Portal collaboration and onboarding

All routes below use the current Google personnel session. Hidden projects/tasks are 404; access is rechecked on every request.

- `POST /api/people` validates the active department, role, optional active position and current term before writing. Person, tenure, invitation campaign and audit commit atomically. Returns 201 `{id, status: 'invited', campaignId}`; no direct mail is sent. CSV import retains per-row outcomes and dry-run behavior and adds a `campaignId` for the newly invited addresses.
- `GET /api/onboarding` returns `{items, complete, dismissed, visible}`. Profile completion derives from public profile fields; phone and registration number are optional. `POST /api/onboarding/acknowledgments` accepts `{item: 'department_read' | 'resources_read' | 'checklist_dismissed'}` and returns the updated checklist. A person can acknowledge only the read items currently available to them; retries preserve the first acknowledgment time.
- `GET /api/notifications` returns `{notifications, nextBefore}`, newest first, 30/page, with optional `before` positive-integer cursor and `unread=1`. Notifications cover assignment, comments and upcoming task deadlines. Rows carry current task/project labels and status, actor name, creation/read times and relevant comment/due-date identifiers, never another person's inbox. `GET /api/notifications/count` returns `{unread, capped}`, capped at 99. Authorization is applied before pagination/count bounds.
- `POST /api/notifications/read` accepts `{ids: number[]}` (1-50) or `{upTo: number}` and marks only the caller's notifications read. Returns the current unread count. Inbox responses are private/no-store.
- `PATCH /api/meets/:id` accepts optional nullable `agenda` (5000 characters) and `notes` (10000), manager-only, 60 writes/hour. Empty strings clear the field; no email is sent. `GET /api/meets` additionally returns these fields and permission-filtered `actionItems`.
- `POST /api/meets/:id/action-items` accepts `{projectId, taskId}` and requires meet management plus project visibility. New links return 201, existing links 200 with `linked: false`. `DELETE /api/meets/:id/action-items/:taskId` needs the same rights and never deletes the task. Hidden action items are omitted entirely from listings.
- `GET`/`POST /api/projects/:id/files` and `/api/projects/:id/tasks/:taskId/files` list/upload private contextual attachments. Multipart uploads use `file`; the shared file extension policy and 25 MiB limit apply. Lists return `{files, limit, canUpload, canDelete}` and hold at most 100 per scope. Upload/delete requires task-management rights; read/download follows project visibility. `GET .../files/:fileId/download` is attachment-only, private/no-store; `DELETE .../files/:fileId` returns 204. Every task/file must match the requested project and exact scope.

Projects additionally accept `internal?: boolean` (default false for existing API compatibility), and use `upcoming`, `active`, `on_hold`, `completed` stages. On internal projects, `departments.projects.manage` covering all departments grants management; that alone cannot convert a project into publishable client work. Internal reads require workspace-read/management rights or explicit project membership, preserving the old department tracker audience rather than granting access from `projects.view` alone. The old department create/status routes now operate on canonical internal projects, and migrated old IDs remain resolvable. Public project lists include only completed non-internal projects.

Task status bodies additionally accept `blocked`, with a nonblank single-line `blockedReason` (up to 500 characters). Clearing a block or completing clears the reason. Today includes pending and blocked work on active visible projects; its 101-row database bound follows authorization and the same status/date/priority ordering as project tasks. Assignment/comment notifications are committed with their originating mutation, not sent in a separate best-effort write.

Deleting file metadata, including a project/task cascade, atomically records a byte-deletion intent. The five-minute file cleanup cron deletes primary R2 objects in batches of 100 and then removes those intents; a failed operation leaves work retryable. Backup/version retention is independent of primary object cleanup.

## Void portal letters contract (slice 9)

These routes use current Google personnel sessions, not legacy Letter Studio OTPs. `letters.manage` is global for admin and department-scoped for director; `letters.send` uses the same defaults. Permissions remain configurable through personnel roles/grants.

- `GET /api/letters`: recent saved document summaries within the caller's manage scope, up to 100. Includes reference, type, filename, byte length, access department, save time, private download URL and email eligibility. Snapshots and storage keys are not in the list.
- `POST /api/letters`: multipart `file` (PDF bytes, maximum 20 MiB) and `metadata` JSON `{departmentId: string | null, data: Record<string,string>}`. The snapshot includes a supported type, reference `180DC-XXXXXXXX` and document date. Manage scope must cover the explicit department (null requires global); free-text template departments never authorize access. Stores immutable metadata and PDF under `CLUB_FILES/letters/<uuid>.pdf`; returns `{id, docnum, filename, bytes, downloadUrl, emailEligible}`. 60/hour.
- `GET /api/letters/:id`: authorized summary, immutable snapshot and durable per-recipient send history. Hidden documents are 404. `GET /api/letters/:id/file`: authorized PDF stream, private/no-store. Documents have no edit endpoint, and shared Club Files never lists them.
- `GET /api/letters/recipients`: people with active/on-leave access within the caller's manage scope; id, name, email, registration number and department for the studio picker.
- `POST /api/letters/:id/send`: `{recipientEmail, requestId: UUID}`, 30/hour. Requires read/manage access plus `letters.send` over the document's department. Department senders may only address active/on-leave people in their own permitted departments; global senders may address external recipients. PDFs above 3 MiB are download/print-only. Subject, body and required attachment come from the saved snapshot/file, never mutable send-form fields.
- A send intent and its email campaign are inserted in one transaction. Identical actor/request retries replay one campaign; another document or recipient with the same UUID is 409. Success means queued, not sent. Durable history distinguishes `queued`, `accepted`, `failed` and `uncertain`; provider-unknown outcomes are never automatically resent. Acceptance is not proof of inbox delivery.

Supported documents: appointment, promotion, termination, transfer, resignation, show-cause, service, relieving, recognition, MOU, announcement, department report and Leadership Decision / Initiative proposal. Template reference numbers are deterministic legacy hashes, not a unique or sequential ledger. PDF bytes are supplied by the authorized operator's browser; signature/header checks do not cryptographically bind them to metadata.

## Void portal newsletter contract (slice 8)

These are the new portal's APIs, not replacements on the legacy Worker (ADR-009). Public success bodies use the shapes below; errors use the portal's standard validation JSON/plain-text codes. No editor OTP or registry credential is accepted.

- `POST /api/newsletter/subscribe` `{email, name?}`: 5/hour; normalized email, optional name up to 120. Always `{pending: true}` for valid input, without enumerating active addresses. Inactive/new addresses receive a 48-hour confirmation link; active addresses are unchanged.
- `POST /api/newsletter/confirm` `{token}`: 20/hour; atomically activates and consumes the hashed token. `{confirmed: true, welcomeBack}`. Invalid, expired, replaced or replayed credentials are 400. Welcome mail includes personal unsubscribe headers.
- `POST /api/newsletter/unsubscribe/:token`: 48 lowercase hex characters. `{status: 'unsubscribed' | 'already' | 'not_found', email}`. Supports no-Origin form-encoded one-click POSTs; GET never changes state. Cross-site browser origins are denied.
- `POST /api/newsletter/unsubscribe-link` `{email}`: 5/hour; always `{requested: true}` and emails a personal link if relevant. It does not unsubscribe by email alone.
- `GET /api/newsletter/subscribers/count`: public confirmed count, 100/minute shared with archive reads. `GET /api/newsletter/subscribers`: global `newsletter.manage`, subscription metadata only, never credentials. `DELETE /api/newsletter/subscribers/:id`: erase plus credential-free audit in one transaction, 60/hour.
- `GET /api/newsletter`: up to 50 published summaries with stable `issue-NN` slugs. `GET /api/newsletter/:id`: published issue by UUID or slug, sanitized content and source/image URLs. Draft lookup is 404 even with its UUID.
- `GET`/`POST /api/newsletter/issues`: global `newsletter.edit`. Lists own/shared drafts (all with `newsletter.manage`). Creation returns 201 `{id}`. Body: `{title (1-255), emailSubject? (1-255), description? (up to 1000), content (up to 50000), format: 'text' | 'html', shared?, sourceAssetId?, imageAssetId?}`.
- `GET`/`PATCH`/`DELETE /api/newsletter/issues/:id`: ownership/shared checks; PATCH takes the complete creation body plus `version` and refuses stale edits with 409 `newsletter_changed`. Editing/deleting is blocked during a broadcast. Only the owner of an unsent issue or a manager deletes it. Writes share 120/hour.
- `POST /api/newsletter/issues/:id/test`: editors, 10/hour shared with event tests. Queues only to the caller's verified address and never publishes; supplied arbitrary recipient fields cannot change the audience.
- `POST /api/newsletter/issues/:id/send`: global `newsletter.send` plus issue access, 3/hour. Claims an unsent issue and creates its campaign atomically, returning `{campaignId, queued}`; repeat/concurrent claims are 409. No active subscribers is 400.
- `POST /api/newsletter/assets`: global `newsletter.edit`, 20/hour. Multipart `file`, up to 20 MiB, PDF/DOCX/JPEG/PNG/GIF/WebP with signature checks. Returns asset id, URL, filename, byte length, MIME and email eligibility. Other editors cannot attach private uploads unless already referenced by the shared issue; managers may.
- `POST /api/newsletter/events`: explicit `{mode: 'test' | 'broadcast', subject (1-255), description (1-4000), sourceAssetId?, imageAssetId?}`. Test needs edit and only reaches self; broadcast needs send and targets confirmed readers, 3/hour. `{campaignId, queued}`. No missing/invalid test recipient can fall through to broadcasting.

This document describes the public and authenticated surface of `admin-api.technical-vitc.workers.dev`. All routes are served by `apps/admin-api/index.ts`.

## Void portal email contract (separate deployment)

The new `apps/portal` deployment uses Google sessions and named permissions, not the legacy power-level/token conventions below. Its complete route table is maintained in [the portal README](../../apps/portal/README.md#api).

- `GET /api/admin/email-queue` and `GET /api/admin/email-queue/:id/deliveries`: `email.view`; campaign counts, recent campaigns, shared hourly usage and per-recipient acceptance records (acceptance by Cloudflare Email Sending, not inbox delivery).
- `POST /api/admin/email-queue/:id/retry-failed`: `email.manage`; 404 missing campaign, 409 while pending/processing, 400 if nothing failed. Successful recipients remain settled.
- `POST /api/send-email`: `email.send`; `{to, subject, body}`. `to` is a string of comma/semicolon/whitespace-separated addresses (20,000 characters maximum); subject is 1–255 characters and plain-text body is 1–4,000. Addresses are deduplicated. Department grants restrict recipients to active/on-leave people in permitted departments. Up to 10 recipients send directly; larger sets or quota-paused direct sends queue. Response: `{sent, failed, queued, total, campaignId}`. Mail carries Reply-To set to the sender.
- Consulting accept/reject routes record the decision even when mail cannot send; `emailSent` is true only after Cloudflare accepts the reply, which carries Reply-To set to the deciding admin.
- `/api/dev/outbox` (GET/DELETE) and `/api/dev/drain-email` (POST) are absent from production builds and require a development test mode. Drain is capture-only and awaited.

## Void portal meets contract (separate deployment)

- `GET /api/meets`: `meets.view`. Club-wide and inter-department meets, plus department meets within the caller's `meets.department.view` scope, earliest first. Each item: `{id, kind, title, description, meetLink, scheduledAt, createdAt, createdBy, authorName, departments: [{id, name}]}`. `meetLink` is null once the meet is more than 24 hours past.
- `POST /api/meets`: `{kind: 'club' | 'department' | 'inter_department', title (1–255), scheduledAt (ISO timestamp), meetLink? (http/https URL, ≤500), description? (≤2000), departmentIds?}`. Club-wide meets take no departments and need global `meets.club.manage`; department meets take exactly one department and need `meets.department.manage` for it; inter-department meets take one or more departments and need global `meets.inter_department.manage`. Unknown departments are 400. Returns 201 `{id, campaignId, queued}` after queueing the announcement. 60 writes/hour per client.
- `DELETE /api/meets/:id`: the manage permission for that meet; 404 when missing. Queued announcements are not cancelled.
- `POST /api/meets/:id/notify`: the manage permission for that meet; queues a new campaign and returns `{campaignId, queued}`. 10/hour per client, counted before the meet is loaded.

## Void portal projects contract (separate deployment)

- `GET /api/projects`: signed in. Every project the caller can see, newest first: project fields plus `termLabel`, `departments: [{id, name}]`, `myRole` (their role if named on it), `tasks: {total, completed}` and `access: {view, manage, manageMembers, manageTasks}`.
- `POST /api/projects`: `{name (1–255), client? (≤255), description? (≤5000), termId?, deadline? (YYYY-MM-DD, a real date), departmentIds (1–20), internal?}`. Needs `projects.manage` covering every department, or `departments.projects.manage` covering every department for internal work. Unknown departments or terms are 400. Queues a `New project: …` email to the departments' leads and returns 201 `{id, notified}`. 60 writes/hour per client.
- `GET /api/projects/:id`: the project with `termLabel`, `departments`, `members: [{id, personId, role, fullName, photoKey, status}]`, `tasks` (open first, then by due date, priority and age; each with `version`, `assigneeName` and `canUpdateStatus`) and `access`. Hidden or missing projects are 404.
- `PATCH /api/projects/:id`: any of the creation fields. Needs project management over all current departments, and over the new ones when `departmentIds` changes; internal-work grants cannot make a project publishable. `DELETE /api/projects/:id` and `PUT /api/projects/:id/status` (`{status: 'upcoming' | 'active' | 'on_hold' | 'completed'}`) need the same management right; setting the current status again returns `changed: false`.
- `GET /api/projects/:id/people`: for people who manage the project's members or tasks. Everyone with access: `{id, fullName, departmentId, member, canSee}`.
- `POST /api/projects/:id/members` `{personId, role (1–80)}`: `projects.members.manage` covering one of the project's departments. The person must have access (400 `person_without_access`); 409 `already_member`. Queues an `Added to … as …` email unless they added themselves. `DELETE /api/projects/:id/members/:memberId` removes the entry (404 when missing); their tasks stay assigned.
- `POST /api/projects/:id/tasks` `{title (1–255), description? (≤2000), assigneeId?, dueDate?, priority? ('low' | 'normal' | 'high' | 'urgent', default 'normal')}`: `projects.tasks.manage` covering one of the project's departments. The assignee must have access and be able to see the project (400 `assignee_cannot_see_project`). 201 `{id}`. 300 task writes/hour per client.
- `PATCH /api/projects/:id/tasks/:taskId` `{version, …fields}`: task managers. Returns `{version, changed}`; a stale `version` is 409 `task_changed`. `DELETE` removes the task.
- `PUT /api/projects/:id/tasks/:taskId/status` `{status: 'pending' | 'blocked' | 'completed', blockedReason?}`: the assignee or a task manager; blocking requires a nonblank reason, and unblocking/completion clears it. Sets or clears `completedAt`; 409 `task_changed` if the task changed after it was read.
- `POST /api/projects/:id/complete-tasks`: task managers; completes every open task and returns `{completed}`.
- `GET /api/content/projects`: public, 100/minute. Completed non-internal projects only: `{id, name, client, description, completedAt}`.

## Void portal task activity and Today (slice 5b)

These routes require a current Google session. Project activity uses the same visibility policy as the project detail route; an inaccessible project or a task belonging to a different project returns 404. Activity and Today responses use `Cache-Control: private, no-store`.

- `GET /api/projects/:id/tasks/:taskId/comments`: `{comments: [{id, authorName, body, createdAt, removed, canRemove}], nextBefore}`. Removed bodies are null. IDs are monotonically increasing integers; newest first, 50/page. `?before=<nextBefore>` pages backwards. Malformed cursors are 400. 120 reads/minute per client.
- `POST` at the same path: `{requestId: UUID, body}`. Plain text, nonblank, no more than 4,000 raw characters, trimmed for storage. Returns 201 `{id, replayed}`. The `(author, requestId)` key is unique: same task/text replays the original id; different target/text or a removed comment is 409 `request_reused`. Comment and audit entry commit together. 30 writes/minute per client.
- `DELETE /api/projects/:id/tasks/:taskId/comments/:commentId`: author or task manager. Missing/wrong-task comments are 404; other readers get 403. Erases text and records an atomic `task.comment.remove` audit entry; repeating is a no-op. Shares the comment write limit.
- `GET /api/projects/:id/tasks/:taskId/history`: `{events: [{id, action, createdAt, actorName, from, to, bulk}], nextBefore}` with the same pagination contract and its own 120/minute limit. Actions: `task.create`, `task.update`, `task.status`, `task.comment`, `task.comment.remove`. Values are allow-listed: title, assignee id/name, due date, priority, status and a description-change flag. No raw descriptions, comment bodies/ids, actor emails or raw details.
- `GET /api/today`: `{generatedAt, tasks, hasMoreTasks, meets, hasMoreMeets, announcements, attention}`. Tasks are open, assigned to the caller, on active projects they can still see; sorted by due date (undated last), priority and age, at most 100. Meets are in `[now, now + 7 days)`, at most 20; inter-department meets must cover the caller's department-view scope. The latest three announcements are included. `attention.invited` is present only with `people.invite` and follows its department scope; `attention.failedEmails` needs global `email.view`. 60/minute.

## Void portal team instances (slice 6)

A team instance is the staffing and progression board for one competition, event or exercise. Rights come from `team_instances.view` and `team_instances.manage` over the instance's departments: **view** needs either grant covering one of them; **staff** (groups, teams, outside people, placements, levels and team status) needs `team_instances.manage` covering one of them; **configure** (settings, departments, the level ladder and deletion) needs `team_instances.manage` covering all of them. Seeded grants: admins view and manage globally, directors view globally and manage their own department, members view globally, advisory members hold neither. Hidden or missing instances are 404 `instance_not_found`. Errors are plain-text codes. Writes to instances, groups, teams and outside people share 120/hour per client; placements and moves share 600/hour.

- `GET /api/team-instances`: either permission. Visible instances, newest first: `{id, name, description, groupLabel, createdAt, departments: [{id, name}], stats: {teams, placements, short}, access: {view, staff, configure}}`.
- `POST /api/team-instances`: configure over every selected department. `{name (1–255), description? (≤5000), groupLabel? (≤40, default "Company"), departmentIds (1–20, deduplicated), levels? (1–20 names of ≤60)}`; blank level names become `Level N` and no levels means one. Unknown departments are 400. 201 `{id}`.
- `GET /api/team-instances/:id`: viewers. `{id, name, description, groupLabel, createdAt, createdByName, departments, levels: [{position, name}], groups: [{id, name, organization, description, sortOrder, teams}], ungroupedTeams, externals: [{id, name, email, organization, placements}], stats: {teams, placements, people, short, active, eliminated, winners}, access}`. A team is `{id, groupId, name, description, minMembers, maxMembers, sortOrder, currentLevel, status, members, count, short, full}`; `members` lists people (`kind: 'person'`, with department, photo and status) before outside people (`kind: 'external'`, with organization). Counts are placements, so someone on two teams counts twice, except in `stats.people`. Outside emails are null unless the caller has staff.
- `PATCH /api/team-instances/:id`: configure, and configure over any new departments. Any creation field; an empty body is 400 `nothing_to_change`. A shorter ladder moves teams above it to the new last level. `DELETE` removes its teams, groups, outside people, levels and placements; its audit trail stays.
- `GET /api/team-instances/:id/people`: staff. People the caller may place: portal access that includes viewing this instance, within the caller's scope (a department grant places only people of its departments). `[{id, fullName, departmentId}]`.
- `GET /api/team-instances/:id/activity`: viewers. The latest 30 `team_instance.*` audit entries, newest first: `{id, action, createdAt, actorName, details}`. Details carry names and values (teams, people, level and status changes), never emails.
- `POST /api/team-instances/:id/groups` `{name, organization? (≤200), description?}`, `PATCH`/`DELETE …/groups/:groupId` (PATCH also takes `sortOrder`): staff. Deleting a group moves its teams to no group, with everyone still on them.
- `POST /api/team-instances/:id/externals` `{name, email?, organization?}`, `PATCH`/`DELETE …/externals/:externalId`: staff. Emails are stored lowercase and are unique per instance (409 `external_email_taken`). Deleting someone takes them off every team.
- `POST /api/team-instances/:id/teams` `{name, description?, groupId?, minMembers?, maxMembers?}` (sizes 1–500, null for no limit): staff. 400 `unknown_group` for a group of another instance, `min_above_max`. 201 `{id}`.
- `PATCH /api/team-instances/:id/teams/:teamId`: staff. The creation fields plus `sortOrder`, `currentLevel` (within the ladder, else 400 `level_out_of_range`) and `status` (`active`, `eliminated`, `winner`). A maximum below who is on the team is 409 `cap_below_members`, checked in the update itself. Returns `{id, changed}`. `DELETE` removes the team and its placements; outside people stay in the register.
- `POST …/teams/:teamId/members` `{personId}` and `POST …/teams/:teamId/externals` `{externalId}`: staff. 400 `person_not_eligible`, 403 `outside_your_departments`, 404 for an outside person of another instance, 409 `already_on_team` or `team_full`. The cap is checked in the insert itself, so simultaneous placements cannot overfill a team. Someone may be on several teams. `DELETE …/members/:personId` and `DELETE …/externals/:externalId` return `{removed}` and are idempotent.
- `POST /api/team-instances/:id/move` `{kind: 'person' | 'external', memberId, fromTeamId, toTeamId}`: staff. The capped insert and the removal run in one batch, so a refused or failed move loses no placement. 404 `not_on_team`, 409 `already_on_team` or `team_full`; `{moved: false}` when both teams are the same.

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

### Reimagined member sessions

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/api/auth/session` | public, valid registry token in body | Exchange `{ token, deviceLabel? }` for independent `{ token, sessionId, expiresAt, email, name, roleId, roleName, powerLevel, departmentId }`. Label defaults to `Web browser`, maximum 80 characters. Fixed seven-day expiry; up to 20 active sessions per current source token. Ten attempts/IP/minute. Works in production; invalid/revoked/expired source returns 401, malformed input 400, quota 429, maintenance 503. |
| GET | `/api/auth/sessions` | member credential | List only this account's active sessions backed by the current registry token: `id`, `device_label`, `created_at`, `expires_at`, `current`. No credential hashes or source tokens are returned. |
| DELETE | `/api/auth/sessions/:id` | owning account | Revoke one owned session; another account's ID returns 404, regardless of rank. Its next authenticated request fails. |
| POST | `/api/auth/logout` | member credential | Revoke the current device session. Legacy-token callers receive success with `legacyToken: true` and must clear local credentials; the source token is preserved. |

Session responses carry `Cache-Control: private, no-store`. Bearer auth accepts existing registry tokens and new opaque `180dc_session_…` credentials. Each device request checks session expiry/revocation, current user/role and active source token with a matching hash. Session creation and individual revocation are audited transactionally. No refresh token or sliding expiry exists yet.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/content/case-studies` | public | Public case study listing. |
| GET | `/api/content/team-members` | public | Leadership team page data. |
| GET | `/api/content/partners` | public | Partners list. |
| POST | `/api/newsletter/subscribe` | public | `{ email, name? }` → always `{ success, pending: true, message }`; emails a confirmation link. 5/hour/IP. |
| POST | `/api/newsletter/confirm` | public | `{ token }` from the emailed link activates the subscription and sends the welcome email; invalid/expired/used → 400. |
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
| GET | `/api/auth/google/start` | public | 302 to Google with PKCE and a single-use state; sets the HttpOnly `g_oauth_state` cookie. 20/min/IP. |
| GET | `/api/auth/google/callback` | public | Google redirect target. Redirects to `/members?google_code=…`, `?google=linked&panel=profile`, or `?google_error=<code>`. |
| POST | `/api/auth/google/exchange` | public | `{ code }` → member session (same shape as `/api/auth/session`). Single-use, 60 s. 10/min. |
| POST | `/api/auth/forgot-token` | public | Email token to member (always returns success). |
| GET | `/api/departments` | public | Department list (name, description). |
| GET | `/api/projects/completed` | public | Completed projects (R2 cache, fallback to DB). |
| GET | `/api/case-studies/images/*` | public | Serve a case-study or newsletter source image/file. |
| GET | `/api/admin/maintenance` | public | Check maintenance mode status. |

## Auth routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/google/link-start` | token | Returns `{ url }` to link the caller's Google account. 10/hour. |
| POST | `/api/auth/google/unlink` | token | Unlink Google and disable Google sign-in. 5/hour. |
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
| GET | `/api/projects` | scoped member | List global projects visible through board, assigned department or explicit project role; the dashboard active-project count uses the same policy. |
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
| GET | `/api/projects/:id/tasks` | scoped member | List tasks only for a readable project; 404 for missing/inaccessible projects. Adds per-task `can_update`. |
| POST | `/api/projects/:id/tasks` | scoped director/board | Create a project task; any assignee must be registered and able to read the project. |
| PUT | `/api/projects/:id/tasks/:taskId` | scoped manager or assignee | Mark pending/completed; unrelated users receive 403, missing/inaccessible project or task receives 404. Stale status/assignment conflicts receive 409. Status retries preserve timestamps; actual changes are audited. |
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
| GET / DELETE | `/api/dev/outbox` | dev only | Emails recorded by `EMAIL_TEST_MODE` (used by `tests/`). Returns 404 unless the mode is on, and always 404 when `ENVIRONMENT=production`. |
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

## Google sign-in

Clerk routes (`/api/auth/clerk-login`, `/api/auth/link-clerk`, `/api/auth/unlink-clerk`) were removed. Google sign-in is the Worker OAuth flow above. The callback requires the `g_oauth_state` cookie to match the state, and the state is deleted on first use. `google_error` codes: `invalid_state`, `expired`, `cancelled`, `not_configured`, `exchange_failed`, `already_linked`, `not_linked`, `inactive`, `maintenance`, `session_failed`, `rate_limited`. The redirect URI is `<request origin>/api/auth/google/callback`. `GOOGLE_AUTH_URL`/`GOOGLE_TOKEN_URL` overrides are honoured only when `ENVIRONMENT` is not `production`. `/api/me` returns `googleLinked` (boolean). Responses containing credentials use `Cache-Control: private, no-store`.

## Reimagined shared library boundary

Club Files list, download and delete routes only traverse flat keys under `general/`, `projects/` and `events/`. `GET /api/club-files?category=...` and multipart upload reject other categories with 400. Missing, private, partial or ambiguous IDs return 404 on direct lookup. Member/advisory shared reads and director/board shared writes retain existing power thresholds. Object scans traverse R2 continuation pages. Download responses use attachment disposition, an encoded filename, `private, no-store` and `nosniff`.

`letters/`, nested keys and other namespaces cannot be accessed through Club Files, including by board members. Letter Studio keeps its separately authenticated routes. Shared Projects is a legacy club-wide category; its display `projectName` is not a resource permission. Future contextual attachments must use a distinct private namespace and their owning resource's API policy.

## Personal work queue (reimagined)

`GET /api/work-queue` requires member Bearer authentication and is limited to 30 requests/IP/minute. Returns `{ success, generatedAt, tasks, hasMoreTasks, meetings, hasMoreMeetings, attention }` with `private, no-store`. Tasks contain `id`, `project_id`, `title`, `description`, `status`, `project_name`, `project_deadline`; they are open tasks assigned to the current user in non-completed projects the user may currently read. Up to 100 tasks are returned, ordered by project deadline and stable IDs. The deadline is a project date, not an individual task date.

Meetings contain `id`, `type`, `title`, `scheduled_at`, `meet_link`; up to 20 relevant upcoming meetings in the next seven days are returned chronologically. Club meetings apply to all members; department/inter-department meetings follow current department membership or board access. `attention.incomingTransfers` counts pending transfers addressed to the current user. Only board responses include `attention.accountRequests`. Truncation flags identify when the larger project/meeting views are needed. Missing/revoked credentials retain middleware rejection.

### Project task scheduling (unified increment)

Task creation accepts optional `dueDate` (nullable `YYYY-MM-DD`) and `priority` (`low`, `normal`, `high`, `urgent`; default `normal`). Task reads and `/api/work-queue` expose `due_date` and `priority`. The work queue orders scheduled tasks by task due date, then priority, creation time and ID; project deadlines remain separate display fields.

`PATCH /api/projects/:id/tasks/:taskId/schedule` edits supplied `dueDate` and/or `priority`, retaining omitted values. Requires board or director management of the assigned project department. Assigned members retain status-update permission but cannot edit schedules. Returns 400 for empty/invalid scheduling fields, 404 for inaccessible projects or wrong-project task IDs, 403 for readable projects without management rights, and 409 for a concurrent schedule change. Clearing a due date uses null. Successful changed writes and `task_schedule_changed` audit records commit in one D1 batch; unchanged retries do not add audit records.

### Combined task owner and scheduling edits

`PATCH /api/projects/:id/tasks/:taskId/details` accepts optional `assignedTo` (member ID or null), `dueDate` and `priority`, with at least one field supplied. Requires `expected: { assignedTo, dueDate, priority }` containing the values read before editing. Requires the same project-management permission as scheduling. Inaccessible projects/wrong-project task IDs return 404, readable non-manager requests 403, missing snapshot or invalid/inactive/out-of-project owner 400, and stale/concurrent edits 409. Null owner clears assignment. Unspecified fields are preserved.

Owner, date and priority update atomically with a `task_details_changed` before/after audit row. The write compares all three prior values and rechecks new-owner account/project eligibility in SQL. An unchanged edit with a current snapshot returns success without another audit; retrying an old snapshot after a changed edit returns 409 and requires reload. The schedule-only route remains compatible. Task creation now also checks active project access at validation and insert time; a concurrent eligibility change returns 409. Status PUT remains unchanged.

### Scoped task history

`GET /api/projects/:id/tasks/:taskId/history?cursor=...` requires current project read access and verifies the task belongs to that project. Inaccessible/missing/mismatched resources return 404; invalid cursors return 400. Returns `{ success, data, nextCursor }` with up to 50 events, newest first. Each event exposes ID, action, creation time, current actor name (or Former member) and selected before/after owner/date/priority/status fields. Actor email and arbitrary audit details are excluded. Events must match both the task target and recorded project ID. Pagination uses an opaque cursor with timestamp and append sequence; same-second events retain insertion order. Successful responses are private/no-store.

Creation records `task_created` with initial owner, date, priority and pending status in the same transaction as insertion. Bulk completion records one `task_status_changed` event for each pending task in the same transaction as the status update; already-completed tasks retain timestamps and receive no new event on a retry. Legacy events not recorded by earlier versions cannot be reconstructed from this endpoint.
