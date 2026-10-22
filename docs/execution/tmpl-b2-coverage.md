# MAIL-05 / B2 coverage against spec section 3.7

This maps each bullet of spec section 3.7 (Email Template Studio) to shipped code
and tests, and lists what is not covered. Paths are relative to `apps/portal/`.
Tests: `src/server/templates/render.test.ts` (unit) and
`tests/e2e/templates.test.mjs` (e2e).

## Coverage map

| Spec bullet | Implementation and evidence | Uncovered requirement |
| --- | --- | --- |
| Reusable, versioned system; do not duplicate the Letter Studio renderer | `db/schema/templates.ts` (`email_templates`, immutable `email_template_versions`), `src/server/templates/studio.ts`. Own text renderer (`render.ts`); Letter Studio is untouched. e2e: revision test (stale save 409, version list). | None. |
| Ownership: global/board, department or mailbox | `owner_scope` with a check constraint; `access.ts` maps global/department to `templates.*` grants and mailbox ownership to mailbox capabilities. e2e: members cannot create global/department/mailbox templates; a mailbox manager cannot create a global one. | No positive e2e path for a director creating a department template (grant seeded, only negative tests run). |
| Field types | `validation.ts` field schema: short, long, date, amount, organisation, contact, select, multi-select, URL, attachment, boolean, rows. UI editor in `src/pages/templates/DefinitionEditor.tsx`. Unit: date/amount/rows rendering. | Repeating rows have free-form columns (no per-column schema). CRM organisation/contact and attachment fields are not exercised by e2e tests. |
| Required fields, validation rules, examples, allowed recipients, default subject/signature, allowed sender mailbox, per-template permission policy | Required/min/max/type checks, examples, `allowedRecipients` (case-insensitive), subject/signature sources, `allowedMailboxIds`, `policy` per action. e2e: required-field refusal, recipient enforcement on create and edit, mailbox management check on allowed mailboxes, policy narrowing publish and approval. | Validation rules are limited to required, type and min/max; no pattern/regex or cross-field rules. The `author` action cannot be narrowed by policy (the template does not exist yet). |
| Trusted automatic fields; no arbitrary HTML or code evaluation | `member_name`, `member_position` (current tenures), `club_name`, `club_website` override caller values; CRM contact fields resolved server-side with consent and do-not-contact checks. Single-pass `{{key}}` substitution, HTML escaped, subject line breaks removed, extra `html` property rejected. Unit: escaping, no re-interpolation, trusted override, header injection. e2e: `{{constructor.constructor}}` and `html` rejected. | Verified CRM data is used only when the drafter picks a contact in a CRM field; there is no automatic "recipient's CRM record" field. "Approved position" is taken from current tenures, not a separate approval record. |
| Preview: subject, HTML, plain text; warnings for unresolved variables and missing/oversized attachments | `POST .../templates/preview`, `TemplateUse.tsx`. e2e: escaped HTML, automatic member name, required/recipient warnings, draft refused while warnings remain. | Attachment warnings are implemented but not exercised by e2e. |
| Version pinning: approvals reference the version and final rendered snapshot | `mail_draft_snapshots.template_version_id`; reviews bind the snapshot (existing A1 behavior). e2e: snapshot carries the version, the approval references that snapshot, earlier drafts keep v1 after v2 is published, an edit keeps the pin. | `template_version_id` has no foreign key (adding one needs a rebuild of an existing table); the server validates it instead. |
| Permission states author/edit/publish/retire/draft-from/review/send; retiring stops new use, sent history intact | `templates.*` permissions plus mailbox capability mapping; `checkPinned` in draft edit/submit/review/send. Migration seeds the grants. e2e: 404 for outsiders, 403 per missing action, retire blocks new drafts and submit on pinned drafts, re-publish after retire is 409, pinned draft remains readable. | An approved send already queued before retirement still dispatches at cron; retirement is checked at API time, not inside dispatch. Publishing has no separate four-eyes review. |
| Test sends only to allowed/verified test recipients; obey provider/category policies | `POST .../templates/test` accepts no recipients and sends only to the caller's own signed-in address through the capture-able system queue, checks the mailbox category policy, mailbox outbound pause and global mail switch. e2e: recipients rejected, captured message goes only to the caller, audit has no content, pause gives 409. | No configurable list of additional verified test recipients; the caller's sign-in address is the only allowed one. |
| CSV audience personalization, if enabled | Not enabled; no CSV upload or per-row jobs. | **Not implemented.** Would need per-row immutable recipient jobs and pre-approval address reporting. No BCC campaign path exists. |
| Starter templates (11 named) | `src/server/templates/starters.ts`, `GET .../templates/starters` (mailbox managers). e2e: all 11 are offered and each is accepted as a valid definition. | Starters are recipes copied into a new template, not pre-seeded templates. |
| Follow-up reminders suggest a draft; never auto-send | `followupDays`, `GET .../templates/reminders`, `FollowUps` panel on the mailbox page. e2e: suggestion only after the interval, no automatic draft or send. | Suggestions are pull-only on the mailbox page; no notification is raised. |

## Delivery constraints

No live email is sent, no DNS or routing is changed and no sender address is
added. Test sends use the existing system queue, captured in tests by
`EMAIL_TEST_MODE=capture`. Do not describe this PR as full spec 3.7 coverage
while CSV personalization and the gaps above remain.
