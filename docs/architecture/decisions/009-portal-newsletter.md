# ADR-009: Newsletter in the fresh Void portal

Status: decided for the new portal; legacy deployment unchanged.

## Context and decision

The user requested a blank-data Void rewrite and Google-only personnel access. The old newsletter's dedicated D1, editor OTP sessions and separate viewer were implementation boundaries, not a requirement to bring legacy data or credentials into the new deployment.

Store `newsletters`, `newsletter_assets` and `newsletter_subscribers` in the portal's Void-managed D1. This makes issue-claim/campaign insertion and subscriber erasure/auditing transactional, with one generated migration history and no extra provisioning/build step. Do not read or write legacy `NEWSLETTER_DB`.

Editors use the existing Google session and global permissions: `newsletter.edit` permits own/shared drafts, uploads and tests to the editor's own verified address; `newsletter.send` additionally permits real broadcasts; `newsletter.manage` overrides ownership and controls subscriber administration. Admins hold all three, directors edit/send, members edit, advisory members none. Role and personal grants remain editable. Unlike the legacy member default, broadcasting requires a deliberate higher-trust grant.

The portal hosts its own `/newsletter` archive and article pages, rather than fetching structured articles from the separate legacy Catalyst site. The editor authors plain text or sanitized HTML directly. Only an issue whose real broadcast finishes with an accepted message is published. A zero-acceptance campaign or self-test never publishes; published issues cannot be broadcast again through the issue endpoint, while failed recipients can be retried through the email queue.

Subscribers need email ownership only, not Google. Confirmation is an atomic, single-use SHA-256 credential claim with a 48-hour expiry. Unsubscribe capabilities are stable, random 24-byte hex values. An email-entry unsubscribe request emails the capability instead of allowing an unrelated person to unsubscribe the address. Opening either link never changes state; confirmation/unsubscribe requires an explicit button or RFC 8058 provider POST.

Cloudflare Email Sending remains the only transport. Real broadcasts recheck subscriber state immediately before every send, personalize unsubscribe URLs and both List-Unsubscribe headers, and skip missing/inactive addresses. Files up to 20 MiB can be linked; only sources up to 3 MiB are attached, leaving room under the 5 MiB encoded-message ceiling. Missing required attachments fail the campaign instead of sending an incomplete issue.

## Alternatives and consequences

A second newsletter D1 would preserve the legacy layout but prevent cross-table transactions with the portal queue. It can be revisited if independent operations or isolation become necessary. Separate editor OTPs would duplicate and weaken the personnel revocation model, so they are not ported.

Old unsubscribe/confirmation credentials are not imported. Before moving a previously used hostname, explicitly review the effect on links issued by that old deployment; retaining old endpoints or forwarding them would be a separate decision. This rewrite never changes the club's upstream newsletter site or databases.
