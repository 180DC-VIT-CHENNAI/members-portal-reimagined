# ADR-008: Send portal email through Cloudflare Email Sending

- **Status:** decided
- **Date:** 2026-10-17

## Context

Slice 7 (PR #28) ported the legacy mailer into `apps/portal` as a custom SMTP client on `cloudflare:sockets`, talking to Spacemail (`mail.spacemail.com:465`) with mailbox credentials. The portal Worker never had those credentials, and the user decided to move the portal to Cloudflare Email Sending instead. `180dc.vitcc.org` was onboarded as an Email Sending subdomain in the deploy account on 2026-10-16, and the account is on Workers Paid.

## Decision

- Send with `sendEmail` from `void/email` through an authored `cloudflare.send_email` binding named `SEND_EMAIL`, restricted to `noreply@180dc.vitcc.org` (`apps/portal/src/server/email/sender.ts`).
- Leave `email.from` unset, so Void does not manage Email Routing or DNS. Every send passes an explicit sender with a per-feature display name.
- Keep the D1 queue, hourly reservation, pacing and retry behavior from slice 7, and map Void's result codes in `apps/portal/src/server/email/outcome.ts`.
- Set Reply-To to the person who wrote the mail, because nothing receives mail at the sending address.
- Remove the SMTP client, the MIME builder and the redirect test mode. Capture mode stays as the deterministic test seam; locally, Void's dev inbox captures real `sendEmail` calls.

## Alternatives considered

- **Keep Spacemail SMTP:** needs mailbox secrets on the portal Worker and keeps several hundred lines of protocol and MIME code that Void already provides.
- **Cloudflare's SMTP endpoint or REST API:** works, but needs an API-token secret; the binding needs none.
- **Set `email.from` and let Void configure email:** Void would also set up Email Routing and plus addressing on the zone, which the portal does not use.

## Consequences

- **Positive:** no mail secrets, less code, authenticated sending (SPF, DKIM and DMARC on the subdomain), and a local inbox for development.
- **Negative:** replies cannot be received at the sending address; Reply-To covers mail a person writes. Cloudflare Email Service is aimed at transactional mail, so newsletter volume (slice 8) has to stay modest and carry unsubscribe headers.
- **Risks:** an `OUTCOME_UNKNOWN` result may already have been accepted. It is marked failed and only resent by an explicit retry.

## Compatibility impact

None for the legacy `admin-api`, which keeps Spacemail until cutover. The portal's `SPACEMAIL_SMTP_USER`, `SPACEMAIL_SMTP_PASS`, `SPACEMAIL_HOURLY_LIMIT` and `EMAIL_TEST_RECIPIENT` variables are replaced by `EMAIL_HOURLY_LIMIT`; none of them was set on the deployed Worker.

## Migration impact

No schema change. `dev_outbox.delivered_to` is no longer written.

## Conditions for reconsideration

Reconsider if Cloudflare Email Sending limits or pricing stop fitting the club's volume, or if the portal needs to receive mail (then configure Email Routing, possibly through `email.from`).
