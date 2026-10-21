# B1 requirement and evidence ledger

Scope: MAIL-02, engineering spec sections 3.4, 3.5 and 13.D. Built on A1 and
rebased on A3 (`90c7ee5`). Fixture verification is not a live routing test.
Partial means a requirement is still uncovered, not an approved scope reduction.

Paths below are relative to `apps/portal`. Tests are executable assertions, not
claims based solely on stored columns or UI labels.

## Section 3.4: inbox behavior (every bullet)

| Requirement | Actual implementation | Verification and uncovered portions |
|---|---|---|
| Inbox, Assigned to me, Unassigned, Drafts, Needs approval, Scheduled, Sent, Failed, Archive, Search | `src/pages/mail/InboxCard.tsx`, `MailboxPage.tsx`, `src/server/mailboxes/inbox-read.ts`, `drafts.ts`. A1's "Needs attention" folder represents failed/uncertain outcomes. | `tests/e2e/mail-inbox.test.mjs`: triage/archive/views and scoped search; A1 `mailboxes.test.mjs`: acceptance, schedule cancellation and uncertain outcomes. Desktop QA exercises Inbox/Assigned. Not every folder has a dedicated browser assertion. |
| RFC threading, fallback correlation, no cross-client leak | `threading.ts`, `inbound-rules.ts`, `sent-thread.ts`; mailbox boundary plus known participant required, including subject fallback. | E2E "threading follows RFC headers and subject fallback..." and "replies are drafted into the thread..."; unit RFC header parsing. Outbound Void transport cannot set reserved RFC reply headers; provider ID/subject fallback only. |
| Person **or team** assignment, tags, priority, notes, due-for-reply reminders, open/pending/closed | `inbox-actions.ts`, `ConversationPage.tsx`; current-read-eligible person assignment, shared tags/status/priority/notes. `inboxCounts` exposes overdue count. Assignment events produce scoped in-app notices. | E2E "only assigners triage..." tests unauthorized assignment, revocation, tags, notes, pending/closed/archive and overdue count; notice test checks assignment fan-out/retry behavior. **Partial:** no team assignment; no timed due-for-reply reminder delivery. A due date/count is not a reminder job. |
| Explicitly authorized CRM contact linking without exposing mailbox contents to CRM users | Only reserved `mail_conversations.crm_contact_id`. No reads/writes or linking UI. | **Uncovered:** the column is an extension point, not a linking workflow. CRM-only principals gain no mailbox access, but authorized link/unlink has no implementation or test. |
| To/CC/BCC, subject, safe rich text + plain text, attachments, drafts, signature, templates, quoted reply, review comments | A1 `DraftEditor.tsx`, `drafts.ts`, `reviews.ts`, `uploads.ts`; B1 `createReply` initializes quoted plain text and routes through the review gate. | A1 recipient/snapshot/attachment e2e assertions; B1 reply e2e and desktop reply draft. **Partial:** composition is plain text converted to escaped HTML, not a rich-text editor. No template selection/application (`template_version_id` stays null; B2 owns Template Studio). |
| Viewer can read/search only; no reply/draft UI, mutation or default export | Server capability checks, hidden mutation controls. Per-member read acknowledgment is allowed; it does not mutate shared mail. No export route. | B1 negative detail/body/search/notes/reply/triage tests and desktop viewer read-only checks; A1 viewer denied draft/submit/review/approve/send/cancel/manage. |
| Drafter can save replies/new mail and submit; submitted revision read-only until reopened | A1 immutable snapshots and revisioned save/submit; B1 conversation-bound reply drafts. | B1 end-to-end reviewed reply; A1 conflicting edits/frozen snapshot assertions. **Partial:** A1 allows editing a submitted draft directly into a new revision; there is no explicit reopen transition. |
| Reviewer/sender sees rendered content/attachment metadata, requests changes, approves/sends/schedules, sees outcomes | A1 `DraftPage.tsx`, `reviews.ts`, `dispatch.ts`, intent state/attempt history; B1 joins accepted mail to threads. | A1 approval, snapshot invalidation, schedule, revocation, accepted/uncertain and attachment tests; B1 reply dispatch test. **Partial:** UI shows frozen plain text and signature, not a rendered HTML preview. Provider acceptance is not inbox delivery proof; no live provider verification here. |
| Manager invite/remove users, access history, sign-off rules, unresolved threads, ownership transfer | A1 membership grants/removal, audit endpoint, signature/policy; B1 inbound toggle and unresolved Inbox/Unassigned views. | A1 membership/self-grant denial and audit isolation; B1 manager does not imply assign/read and retired/disabled refusal. **Partial:** no complete manager-facing access-history/sign-off editor or explicit ownership-transfer workflow. Member picker uses existing personnel rather than a standalone invite flow. |
| Every list paginates and applies ACL; push/unread counts use same scope | Conversation/message/draft lists and mail notices have cursors; mailbox ACL precedes queries; unread conversation and combined notification counts recheck grants. | B1 inaccessible/admin/cross-mailbox/search tests; notice cursor and count revocation tests. **Partial:** quarantine stops at 50, notes at 50 and assignees at 100 without cursors; inherited membership/mailbox lists also lack complete pagination. No push delivery. Bounded lists alone do not meet full pagination. |
| Per-member unread, canonical shared messages and assignment history | `mail_conversation_reads`, shared `mail_messages`/`mail_conversations`; triage writes a mailbox audit event; private `mail_notifications` read acknowledgments are separate from conversation unread. | B1 redelivery/read-state test confirms independent members and new-message unread; assignment and notice acknowledgment tests. **Partial:** triage audit has actor/target/time but not complete before/after assignment history or a history UI. |

## Section 3.5: routing and storage (every bullet)

| Requirement | Actual implementation | Verification and uncovered portions |
|---|---|---|
| No personal Gmail canonical forwarding | `email/_default.ts` invokes `ingestInbound`; raw bytes in private R2 and normalized metadata in portal D1. | Fixture handler and E2E acceptance/storage assertions; no forwarding call. Routing configuration/live address remains intentionally owner-controlled. |
| Separate original bytes/envelope; forged From and auth results are signals only | Raw-object key/hash/size, envelope columns, parsed identities and advisory auth headers; conversation UI warns sender address is not verified identity. | Unit exact raw delivery, Unicode subject/display-name sanitization and advisory DKIM header; E2E envelope/storage. **Limit:** known-participant correlation is not cryptographic sender authentication. |
| Robust transport/content dedupe, not Message-ID alone | Unique per-mailbox raw SHA/content keys; stable headers plus envelope/body hashing; D1 batch race loser rolls back. | Unit content identity across Received/ARC rewrites; E2E duplicate/relayed events, deleted-quarantine replay and notice dedupe. Missing/duplicated Message-ID has no unique-message constraint. No explicit concurrent redelivery test. |
| Block external resources/scripts/remote images/execution; opt-in remote content | `sanitize-email.ts`, script-less sandbox, independent CSP; HTTP(S) images only after opt-in. | Unit hostile tags/attributes/URLs/forms/data images; E2E body policy and remote opt-in; desktop iframe inspection. |
| Safe MIME, filenames, Unicode, internationalized addresses, plain/multipart/inline metadata; size/danger controls | `postal-mime` bounded nesting/headers/parts; safe filename/identity transforms, IDN host normalization, text/HTML bounds; passive extension+MIME allowlist; 25 MiB handler limit and stricter 10 MiB parse quarantine. | Unit encoded Unicode subject/display name, traversal filename, plain/multipart PDF/executable/mismatch, parse-size and handler-size assertions; E2E malformed/unsafe quarantine. **Partial verification:** no dedicated IDN/EAI or inline-image fixture. Inline content ID is stored but CID images are not rendered; allowlist is not malware scanning. |
| Authenticated/audited/private/safe downloads; short-lived signed URLs if used | `downloadInbound` checks live mailbox/conversation and allowed attachment status; streamed private/no-store octet-stream attachment with sanitized disposition; no signed URL. | E2E private download headers/bytes, outsider denial and released-dangerous attachment denial. **Partial:** sensitive inbound download does not yet write an audit event. |
| No public/cross-mailbox search index | SQL mailbox predicate plus live grant; quarantined messages excluded. | E2E scoped search, wildcard escaping and invisible quarantine. No public index is created. |
| Unparseable recovery/quarantine with safe tooling, no silent discard | Manager-only raw header text, restricted list, release with blocked attachments retained, explicit deletion; event identity survives deletion. | Unit parser fallback/storage-failure propagation; E2E manager-only quarantine/release/delete/audit and dedupe; desktop headers screenshot. **Limit:** header-only inspection cannot repair malformed MIME; releasing it does not reparse content. |
| Hosted mailbox alternative retains normalized ACL model (conditional) | Cloudflare inbound adapter selected; no hosted webhook/IMAP adapter. | Not applicable to selected adapter. No claim of hosted-provider interoperability. |

### Recommended pipeline

| Stage | Evidence |
|---|---|
| Internet -> explicit group routing -> designated Worker | Owner-controlled, **not live verified**. No `email.from`, `cloudflare.addresses`, DNS, Email Routing or deployment changes. |
| Verify target/status and bounded MIME parsing | `ingest.ts`, `inbound-handler.ts`, `mime.ts`; refusal/handler/parser fixtures. |
| Private original plus normalized metadata/indexes | `ingest.ts`, additive migration; storage E2E. |
| Quarantine/sanitize untrusted input | `quarantine.ts`, `sanitize-email.ts`; unit, E2E and desktop checks. |
| Conversation plus scoped in-app notice | Atomic `notifyInbound`, `notifyAssignment`, `notifyReview`; shared `/notifications` mailbox section and existing combined count. Two notice E2E tests cover recipients, privacy, redelivery, acknowledgment, revocation, paging and release. |
| Authorized portal/Android API access | Personnel-authenticated HTTP APIs exercised by E2E and desktop portal. Android client/device exercise belongs to AND-01 and is **not verified here**. |

## Section 13.D: each acceptance step

1. **Configured company/group address:** fixture envelope only. Real routing/pilot
   is intentionally not configured or tested.
2. **Worker stores original and normalized metadata:** handler unit harness plus
   MIME-through-dev-handler E2E; metadata and private object content checked.
3. **Correct thread and scoped notice:** threading/reply/notice E2E plus desktop
   inbox, triage, notification section and read acknowledgment.
4. **Different mailbox cannot discover message:** negative list/detail/body/
   attachment/search/count assertions; outsider/admin inbox and notice assertions.
5. **Duplicate deliveries do not duplicate mail:** raw/relay/deleted replay tests
   and notice dedupe. Visible authorized fixture thread has no personal-inbox
   dependency. **Live pass criterion remains unverified** until owner routing.

## Notification integration boundary (A3 / section 4 item 6)

B1 covers incoming client mail, assignment changes and email review requests.
It reuses `/notifications`, the combined unread badge, personnel guards, notification
rate-limit keys and recipient read-acknowledgment pattern. Separate additive
`mail_notifications` preserves the task/message tables' foreign-key contracts.
Stored rows and responses never copy mail subject, sender or body. Query-time ACLs
hide revoked recipients and non-reviewers; resolved reviews stop appearing.
No private text is copied into broadly visible task or internal-message notices.

Mail-category opt-out, quiet-hours delivery, bundling, push/digest, timed reply-due
reminders, plus other domains' approvals/project/meeting integrations remain
uncovered. This package does not claim to finish the entire unified inbox.

## A4 offboarding integration contract

- Schema: `db/schema/mail-inbox.ts`, exported `mailConversations.assignedTo`,
  SQL `mail_conversations.assigned_to` (nullable FK to `people.id`). There is no
  `assigned_person_id` field.
- Reusable operation: exported `triageConversation` in
  `src/server/mailboxes/inbox-actions.ts`. Example:

  ```ts
  await triageConversation(actor, {
    mailboxId,
    conversationId,
    body: { assignedTo: replacementPersonId }, // null explicitly unassigns
  });
  ```

- HTTP surface: `PATCH /api/mailboxes/:id/conversations/:conversationId`, thin
  handler at `routes/api/mailboxes/[id]/conversations/[conversationId]/index.ts`;
  input schema `triageInput` in `src/server/mailboxes/inbox-validation.ts`.
- Actor must currently hold `mailbox.read` **and** `mailbox.assign`; platform
  admin or organization-lifecycle permission does not grant mailbox access.
  Inaccessible mailbox/thread is 404, missing assign capability 403, inactive
  or non-reading replacement 400. Actor/target grants are rechecked inside the
  guarded D1 write. No requirement that the old assignee still has a grant.
- Reassignment preserves status/priority/tags/due date unless explicitly patched,
  writes `mail.conversation.triage` to `mail_audit`, and notifies the replacement
  (except self-assignment/unchanged assignment). Reuse the operation rather than
  updating `assigned_to` directly and bypassing current eligibility.
- Verification: existing triage E2E now explicitly reassigns after revoking the
  former assignee, checks preserved triage fields, then unassigns.
- This is a single-conversation operation, **not** an atomic bulk offboarding
  transaction. A4 owns enumeration and partial-failure handling. Outstanding email
  review requests are capability-based (`mail_drafts.state = 'submitted'`), not an
  assigned reviewer field; transferring grants must not rewrite prior approval
  signatures. Neither org worktree nor A4 code is edited by B1.
