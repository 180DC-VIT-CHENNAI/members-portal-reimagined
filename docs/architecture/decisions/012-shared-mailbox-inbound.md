# ADR-012: Shared mailbox inbound storage, threading and quarantine

Status: decided for implementation, 2026-10-21. Fixture-verified only; no live inbound route exists yet.

## Context

ADR-011 gave shared mailboxes review-gated sending but no inbox. Spec sections 3.4-3.5 and scenario 13.D need incoming mail stored privately in the portal and threaded per mailbox. Members who lack read access to a mailbox must not be able to see that mail. Untrusted HTML and attachments must be contained, and unparseable mail must be kept for review rather than dropped. Mail must not be forwarded to a member's personal Gmail.

## Decision

- **Adapter.** The portal Worker has a single Void email handler, `email/_default.ts`. It reads at most 25 MiB, refuses anything larger, and passes the bytes to `ingestInbound`. A recipient is accepted only when its full lowercase address equals an `active` mailbox with `inbound_enabled = 1`; every other recipient is refused with an SMTP reject. A storage or D1 failure is thrown back to the transport instead of being accepted silently. The handler is the only machine identity: no user route accepts an envelope. The single exception is the `.dev.ts` ingest route, which is excluded from production builds and also requires `EMAIL_TEST_MODE=capture` and `INBOUND_TEST_INGEST=1`.
- **No routing ownership.** `void.config.ts` keeps `email.from` and `cloudflare.addresses` unset, and `void.lock.json` has no addresses. Deploying the handler therefore creates no Email Routing rule. The pilot rule for `technical@180dc.vitcc.org` is an owner action outside this repository. The `SEND_EMAIL` sender allowlist is unchanged.
- **Storage.** The original bytes go to private `CLUB_FILES/mail-raw/<mailbox>/<sha256>` before any metadata row exists. Raw HTML and attachments go under `mail-inbound/<mailbox>/<message>/`, and each object is served only through ACL-checked routes. Normalized envelope, identities, threading headers and text live in D1; `Authentication-Results`/SPF headers are kept only as advisory signals.
- **Deduplication.** `mail_inbound_events` holds two unique keys per mailbox: one on the raw SHA-256, and one on a content identity. The content identity hashes the envelope, the stable headers (Message-ID, Date, From, To, Cc, Subject, content type) and the body hash, so a relay that adds Received/ARC headers still matches. A lost race rolls back the whole batch. The RFC Message-ID alone is never trusted.
- **Threading.** In-Reply-To and References match an earlier message's RFC or provider message ID, but only within the same mailbox and only when the sender is already a participant of that conversation. The fallback is a normalized reply subject from a known participant within 90 days. Otherwise a new conversation starts, so a third party quoting a Message-ID cannot join or read another client's thread. Accepted shared-mailbox sends add an outbound message and their recipients as participants in the same dispatch batch. Void reserves `Message-ID`/`In-Reply-To`/`References` on sends, so outbound mail cannot carry RFC reply headers. Replies to it thread through the provider ID when the client quotes it, or through the subject fallback.
- **Containment.** A narrow passive-file allowlist (extension and MIME must agree) controls release. Executable, mismatched or excess attachments quarantine the whole message, and released messages keep those attachments blocked. HTML is rebuilt from known passive tags without copying any input attribute except vetted http(s) `href`/`src`. It is rendered in a script-less sandboxed frame under its own CSP, and remote images load only on explicit request.
- **Quarantine.** Unparseable, oversized-to-parse or dangerous mail is stored without a conversation, listed only to `mailbox.manage`, and is never searchable. Managers can view the raw headers as text, release the message into threading, or delete its bytes. A deleted message's event identity remains, so a redelivery is still deduplicated.
- **Inbox model.** Conversation status, priority, tags, assignee, reply due date and internal notes are canonical and shared. Read state is kept per member. Triage requires `mailbox.assign`, and assignees must hold current `mailbox.read`. Every list, count, search, body and download is checked against the caller's live grant. The nav unread badge counts only mailboxes the caller can read now.

## Alternatives and consequences

A separate inbound Worker would duplicate the D1/R2 bindings and access code without adding isolation, because the portal already owns both. Per-address handler files would hardcode a configuration value. Forwarding to Gmail is not canonical storage. Rendering through the existing case-study sanitizer would keep attributes and remote images.

The task-bound `notifications` and internal-message-bound `message_notifications` tables cannot hold mailbox notices without changing their existing foreign-key contracts. Following A3's separate mention section, additive `mail_notifications` integrates a mailbox section into the same `/notifications` surface and combined badge. Source transactions create incoming, assignment and review events. Rows contain only identifiers/event kinds, never confidential subjects, senders or bodies. Recipient and live mailbox-read grants filter lists and counts; review events additionally recheck review capability and submitted state. A revoked grant immediately hides old events. Quarantine emits no reader notice until release. Mail preference controls, quiet delivery, push, digests and due-for-reply notification jobs remain uncovered; the overdue count is not a reminder delivery mechanism.

## Compatibility and migration

The changes are additive: eight inbox tables plus `mailboxes.inbound_enabled` (default off) in one generated migration. Existing mailboxes keep refusing inbound mail until a manager enables it. No legacy import is made, and no bucket, DNS or routing change.

## Reopen conditions

Reconsider when one of these happens:

- a hosted mailbox provider or IMAP sync replaces Cloudflare routing;
- a malware scanner becomes available, which would allow a wider attachment policy;
- retention or legal-hold rules are approved;
- notification delivery preferences/bundling are unified across domain-specific events.
