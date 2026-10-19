# ADR-011: Shared mailbox ACLs and review-gated sending

Status: decided for implementation, 2026-10-19.

## Context

The global system-mail composer does not represent a shared business inbox. Member titles must not grant confidential correspondence access, and draft authors must not bypass review through another sending route.

## Decision

Keep the domain in the existing Void portal/D1/R2. Store explicit mailbox-local capability rows, immutable draft snapshots, digest/policy-bound reviews and a durable send intent/attempt history. Administrators may provision another manager but cannot silently read or grant themselves a mailbox.

Always require approval in this initial release. A distinct reviewer is the default. Revalidate live grants, identity status, mailbox policy and the frozen content in the dispatch claim. Editing invalidates approval and pending sends.

Separate transports from system campaigns. New mailboxes start disabled. Development capture never runs in production; the Cloudflare adapter is limited to replies on existing correspondence. The chosen pilot is `technical@180dc.vitcc.org`, but its inbound handler, binding change and explicitly approved routing rule belong to the next package. No DNS/routing resource is changed here.

## Alternatives and consequences

A global `email.send` grant would leak cross-mailbox authority. Personal forwarding is not canonical storage. A separate SMTP service is unnecessary. D1 cannot transact with an external provider: after a call begins, a lost response or interrupted claim is uncertain and must not be replayed automatically. The UI must say accepted, not delivered.

## Compatibility and migration

Additive mailbox tables/indexes plus an admin provisioning permission; existing mail, letters and newsletters keep their routes and `noreply` identity. No legacy import, new bucket or live provider configuration. Private mailbox files use their own prefix in `CLUB_FILES`. Production deployment remains through origin/main PRs.

## Reopen conditions

Reconsider when a compliant outreach provider is selected, retention/legal-hold rules are approved, or per-recipient reconciliation needs another delivery policy. Exactly-once external delivery is not claimed.
