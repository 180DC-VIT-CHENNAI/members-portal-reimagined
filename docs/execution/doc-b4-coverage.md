# DOC-01 / B4 coverage against spec section 8.2

This is a **partial implementation**, not completion of DOC-01. The following
maps all nine bullets in the assigned specification to shipped code and tests.
Paths below are relative to `apps/portal/` unless stated otherwise.

## Coverage map

| Spec bullet | Actual implementation and evidence | Uncovered requirement |
| --- | --- | --- |
| Private scoped folders: club, department, project, engagement, HR, shared mailbox attachments | `src/server/document-access.ts` resolves existing club-file and project/task-file identities through their ACLs; no new folder model. `tests/e2e/documents.test.mjs`: shared/task lifecycle and outsider denial. | No folder hierarchy or folder ACLs. No dedicated department, engagement, HR or mailbox-attachment lifecycle areas. A department-scoped project is not a department folder; a CRM-linked project is not an engagement folder. Existing mailbox storage is not enrolled into document versions/holds by this package. |
| Versions, checksums, ownership, review status, restore history, retention schedule | `db/schema/documents.ts`, `src/server/document-access.ts`, `document-versions.ts`: immutable bytes, SHA-256, owner at initialization, uploader, numbered versions, restores as new versions; manager-editable review/retention metadata. `documents.test.mjs`: version checksum/uploader/restore and shared/task lifecycle tests. | Owner is recorded, not an ownership-transfer workflow; lazily enrolled shared files have no recovered owner. Review status does not gate export, sharing or download. `retentionUntil` is stored only: no due-date enforcement, minimum-retention deletion guard, scheduled expiry or disposition-review queue. |
| Secure links with expiry, download restrictions, optional approval | `src/server/document-shares.ts`: hashed tokens, maximum 30-day expiry, atomic download cap, optional active-member sign-in, revoke, frozen version, creator-access recheck. `documents.test.mjs`: token hashing/revoke, concurrent cap, expiry, sign-in, frozen version and creator-access removal tests. | No request/approve/reject workflow or required approval before sharing/download. A file reader may create a bearer link immediately; `reviewStatus=approved` is not a share approval. |
| Full-text search over authorized content only, strict filters at query time | `src/server/knowledge.ts` searches article title/body with escaped SQL `LIKE` and ACL/status predicates before pagination. `knowledge.test.mjs`: department body-search isolation, draft isolation and workspace grants. | Not a document-content full-text index: no PDF/Office/text extraction, ranking or search across private files, HR records, engagements, mailbox attachments or Letter Studio. Club-file metadata filtering is not file-content search. |
| Knowledge for SOPs, engagement methodologies, department processes, tutorials, handovers | `src/pages/Knowledge*.tsx`, `src/server/knowledge.ts`, `knowledge-markdown.ts`: generic global/department articles, tags, revision history, publish permission and escaped Markdown. `knowledge.test.mjs`: publish separation/revisions, scopes and hostile HTML. | No separate structured methodology/tutorial templates or seeded content; arbitrary articles can represent those content categories. No engagement-specific article ACL. |
| Content metadata and links among tasks, meetings, CRM, knowledge | Knowledge schema/editor stores title/tags/project/task/meet IDs. `knowledge.ts` checks links on writes and redacts inaccessible links on detail/history reads. `knowledge.test.mjs`: rejects hidden project and invalid task/meet references. | No CRM organization/opportunity/engagement links, general file-to-content linking, reciprocal link registry or backlinks. Positive task/meeting link rendering and later-access-loss redaction are not directly exercised by the B4 tests. |
| Explicit archival/deletion for confidential client files and member records | `document-versions.ts` archives files, blocking new versions/restores/shares; public shares stop. Authenticated historical/current downloads remain allowed. File deletion and parent cascades queue version keys for existing cleanup. `documents.test.mjs`: archive behavior, legal holds on file/task/project, SQL cascade protection, cleanup cron and invalidated shares. | No confidential-client disposition policy or member-record archival/erasure workflow. Archiving does not hide files from authenticated readers or prohibit ordinary deletion absent a hold. No knowledge-article deletion endpoint. No automatic deletion policy has been approved. |
| Reuse Letter Studio and preserve immutable PDF snapshots | Existing Letter Studio is unchanged. `tests/e2e/letters.test.mjs`: immutable scoped PDF/snapshot regression; supported document types include appointment/promotion/notices. | Letter PDFs are not enrolled into the new document review/retention/share lifecycle. No new approved-export workflow is supplied by B4. |
| Optional legally meaningful signing; printed signatory is not a cryptographic signature | No signing provider or cryptographic-signature claim is introduced. | E-signatures explicitly excluded by the package brief. Antivirus also explicitly excluded, though it is not one of these nine bullets. |

## Retention and legal holds

The specification asks for a retention schedule but does not prescribe durations,
an expiry action, or authority to erase client/member data. This package does
not infer automatic deletion. The stored date is an **unimplemented schedule
requirement**, not retention enforcement. A complete follow-up must define
whether the date means retain-at-least-until, review-on, or expire-on, and the
authorized disposition action, before enforcing it.

Legal holds are effective now: API checks reject file/task/project deletion and
the `documents_legal_hold_delete` trigger prevents SQL cascade bypasses. Holds
remain effective while archived. Releasing a hold requires the existing file
management right and is audited.

## Delivery constraints

All version bytes reuse `CLUB_FILES`, its existing failover and the 25 MiB file
policy. No new binding, bucket, live email, DNS change or deployment is needed.
The remaining features above are gaps, not provider/device blockers or complete
placeholder workflows. Do not merge this PR under a claim of full DOC-01 coverage.
