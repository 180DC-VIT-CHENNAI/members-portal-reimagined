# Spacemail Setup for 180DC

> **Status:** Live. The `sendEmail()` choke-point, all Resend call-site replacements, the
> `email_queue` + cron drain, and the `NEWSLETTER_DB` split are deployed. Root Cloudflare
> DNS records (MX, SPF, `spacemail._domainkey` DKIM) are in place and verified, and the
> production secrets use the `technical@180dcvitc.org` mailbox. Test sends went through
> SMTP with no Resend fallback, and a production queue drain test completed.
> `NEWSLETTER_SITE_URL` is intentionally empty until the separate newsletter site
> (ADR-004) is deployed. Ordered checklist:
> `docs/execution/current-state.md` → "Next steps — newsletter system".

## Why this document exists

180DC is migrating email sending from Resend to Spacemail (Spaceship/Namecheap business
email) to finish the newsletter system. During Spacemail onboarding, only `@180dcvitc.org`
mailbox addresses could be created — `@mail.180dcvitc.org` addresses were not available.
This document explains why that happened, what the current DNS state means, and exactly
how to fix it so `From: technical@180dcvitc.org` sends authenticate correctly.

## TL;DR

- **It is NOT a Resend configuration problem.** Resend has no control over what Spacemail
  accepts or how its DNS verification works.
- The Spacemail DNS verification records (MX + SPF) were created on the **subdomain**
  `mail.180dcvitc.org`, but the mailbox addresses are at the **root** domain
  `@180dcvitc.org`. Sending from `@180dcvitc.org` therefore fails SPF/DKIM.
- The root domain `180dcvitc.org` had **no MX records and no SPF record** at all, so
  moving Spacemail onto the root domain broke nothing and was the correct fix. This is now
  done (see Current DNS state above).

## Current DNS state (verified live 2026-10-06)

| Domain | Record type | Value | Status |
|--------|-------------|-------|--------|
| `180dcvitc.org` | TXT | `fbf0abfa-cc4f-4339-833f-357bd3b40167` (Spaceship domain verification) | Present |
| `180dcvitc.org` | MX | `mx1.spacemail.com`, `mx2.spacemail.com` (priority 0) | Present |
| `180dcvitc.org` | TXT (SPF) | `v=spf1 include:spf.spacemail.com ~all` | Present |
| `spacemail._domainkey.180dcvitc.org` | TXT (DKIM) | `v=DKIM1;k=rsa;p=...` (account-specific) | Present and resolving |
| `_autodiscover._tcp.180dcvitc.org` | SRV | `0 0 443 autoconfig.spacemail.com` | Present (mail clients only) |
| `resend._domainkey.180dcvitc.org` | TXT (DKIM) | two `p=...` keys (rotation pair) | Present — keeps Resend fallback authenticating |
| `_dmarc.180dcvitc.org` | TXT | `v=DMARC1; p=none;` | Present |
| `mail.180dcvitc.org` | MX/TXT | previous subdomain records | Removed |

Notes:
- The SPF record authorizes Spacemail only. Resend does not need a root SPF include: it has
  no SPF record of its own and its fallback sends are authenticated by DKIM
  (`resend._domainkey`), which aligns with `From: @180dcvitc.org`.
- The `send.180dcvitc.org` return-path subdomain records are absent, so if SPF alignment
  for the Resend fallback is ever required, add Resend's custom return-path MX + SPF there
  (not at the root).

## Root cause: why `mail.180dcvitc.org` "doesn't work" as a From domain

1. During Spacemail onboarding, the domain was added in a way that placed Spacemail's
   required DNS records (MX + SPF) on the **subdomain** `mail.180dcvitc.org`.
2. Spacemail mailbox addresses, however, are created at the **parent** domain — the
   account owns `180dcvitc.org`, so addresses look like `team@180dcvitc.org`, not
   `team@mail.180dcvitc.org`.
3. The result is a mismatch:
   - Mail *delivered* to `mail.180dcvitc.org` routes to Spacemail, but
   - Mail *sent* `From: team@180dcvitc.org` cannot authenticate, because the root domain
     has no SPF record and no DKIM key pointing at Spacemail.
4. Resend is unrelated to this. Resend only affects what Resend itself accepts as a
   `from` address; it cannot restrict which domains Spacemail verifies.

## The fix: move Spacemail DNS to the root domain

The root domain is currently "free" — it has no MX records, no SPF, and no mail service
of its own — so this change is safe and does not disrupt any existing mail flow.

### 1. Add MX records at the root (`180dcvitc.org`)

| Type | Name | Value | Priority |
|------|------|-------|----------|
| `MX` | `@` | `mx1.spacemail.com` | 0 |
| `MX` | `@` | `mx2.spacemail.com` | 0 |

> DNS-only (grey cloud) — never proxy MX records.

### 2. Add SPF at the root

| Type | Name | Value |
|------|------|-------|
| `TXT` | `@` | `v=spf1 include:spf.spacemail.com ~all` |

> If Resend is kept as a fallback sender, combine both includes instead:
> `v=spf1 include:spf.spacemail.com include:resend.com ~all`

### 3. Add DKIM at the root

Spacemail publishes DKIM as a **TXT record** (not a CNAME) with host `spacemail._domainkey`.
Get the unique value from **Spaceship → Launchpad → Advanced DNS → your domain →
Inactive records → Spacemail DNS records**: copy the TXT that starts with
`v=DKIM1; k=rsa; p=MIIBIjANB...`.

| Type | Name | Value |
|------|------|-------|
| `TXT` | `spacemail._domainkey` | the unique `v=DKIM1; k=rsa; p=...` value from your Spaceship account |

> The value is account-specific and cannot be guessed. Spaceship nameservers set it
> automatically, but this domain uses Cloudflare DNS, so it must be added manually.
> Optional: an SRV `_autodiscover._tcp` → `autoconfig.spacemail.com` (port 443) record
> is only for mail-client autoconfiguration, not for sending.

> **Key rotation hazard (hit once, 2026-10-05):** Spaceship cannot rotate DKIM
> automatically for external DNS. Spacemail rotated the `spacemail._domainkey` key and
> outgoing mail failed `dkim=fail ("headers rsa verify failed")` until the new value from
> Spaceship → Advanced DNS → Inactive records → Spacemail was published in Cloudflare.
> If external recipients (especially `@vitstudent.ac.in` / Gmail) stop receiving, check
> this record first. Verify by sending a test and reading `Authentication-Results:
> dkim=pass` in the delivered headers.

> **Outbound rate-limit hazard (hit 2026-10-06, resolved):** a Spacemail **trial
> (including the Pro 30-day free trial) allows only ~20 messages/hour**; sending more
> returns `554 5.7.1 ... Reject: too many messages from sender in last 60 minutes`, after
> which `sendEmail()` falls back to Resend. The account was upgraded to paid (500/hour)
> and the temporary `SPACEMAIL_HOURLY_LIMIT=20` secret was removed. If a future mailbox is
> on trial, set `SPACEMAIL_HOURLY_LIMIT=20` (or `15` to be safe) so pacing matches the
> plan. Single-recipient sends consume this quota one message per recipient — prefer BCC
> batching for large lists while on a trial.

> **Outbound spam-filter format hazard (hit once, 2026-10-05):** Spacemail's Jellyfish
> filter (error `JFE040000`, codes documented by Namecheap KB 10664) rejects messages that
> are HTML-only with base64 bodies and no plain-text part (`JFE040031`, `JFE040012`,
> `JFE040014`). `buildMimeMessage()` therefore emits `multipart/alternative` with
> quoted-printable text/plain + text/html parts; attachments wrap it in
> `multipart/mixed`. Do not revert to a single base64 HTML part — outbound mail will be
> bounced at DATA with `550 5.7.1 Rejected due to high probability of spam`. Bounces are
> delivered to the `technical@` mailbox.

### 4. Clean up the subdomain records (optional)

The `mail.180dcvitc.org` MX + SPF records are no longer needed once the root domain is
configured. They are harmless if left in place, but removing them avoids confusion.

### 5. Verify

- Wait 5–30 minutes for Cloudflare DNS propagation.
- Spacemail Manager should show the domain as verified at `180dcvitc.org`.
- Send a test email `From: technical@180dcvitc.org` and check SPF/DKIM pass (e.g. via the
  test mailbox's headers or an SPF/DKIM checker).
- Keep DMARC at `p=none` for at least a week after switching, then consider
  `p=quarantine`.

## What this enables

Once the root domain is verified in Spacemail:

- `From: 180DC Newsletter <technical@180dcvitc.org>` sends authenticate correctly through
  Spacemail SMTP (`mail.spacemail.com:465` SSL, or `:587` STARTTLS; auth = full mailbox
  address + mailbox password).
- No `@mail.180dcvitc.org`-style From addresses are needed.
- All From addresses use the authenticated mailbox `technical@180dcvitc.org`, so
  Spacemail's sender-ownership check passes without aliases.

## Spacemail sending limits (for planning the newsletter send)

- **500 emails per hour per mailbox** on paid plans (trial plans: 20/hour).
- **Up to 50 recipients per email**, including To, CC and BCC combined.
- Max message size 50 MB.
- Limits are per mailbox; aliases share the same quota.

Implication for the newsletter (updated 2026-10-07): the list is small (tens of
subscribers), so newsletters and event mails are sent **one message per subscriber**,
1.5 s apart, each with that subscriber's `/unsubscribe/<token>` link and RFC 8058
one-click `List-Unsubscribe` headers. Per-recipient mail avoids the
`undisclosed-recipients` BCC pattern and makes one-click unsubscribe possible. At
500 messages/hour, the list can reach several hundred before a send spans more than an
hour. Beyond that, move only the transport behind `sendEmail()` (e.g. to Amazon SES);
the queue, templates, and unsubscribe flow stay as they are. Meet notifications are
also one SMTP message per recipient, so no queued campaign uses BCC batches.

## Backend migration plan: Resend → Spacemail SMTP

### Sending architecture

Spacemail has **no REST API for sending email** — it is SMTP-only:

- SMTP host: `mail.spacemail.com`
- Port `465` (implicit SSL/TLS) or `587` (STARTTLS)
- Auth: full mailbox address (`technical@180dcvitc.org`) + mailbox password
- From Cloudflare Workers: use the outbound TLS TCP support (`connect()` from
  `cloudflare:sockets`) and speak SMTP directly (EHLO → AUTH LOGIN → MAIL FROM →
  RCPT TO → DATA). A minimal SMTP client is ~150 lines with no npm dependencies.

### Step 1 — Single choke-point function

Add one `sendEmail(c, { from, to[], subject, html, attachments })` helper in
`apps/admin-api/index.ts` that:

- Batches `to[]` into groups of 50 and sends one SMTP message per batch with all
  recipients in **BCC** (Spacemail's 50-recipient-per-message limit).
- Builds a MIME message (base64 body, optional PDF attachment).
- Replaces the `daily_email_count` / `MAX_DAILY = 100` logic with Spacemail-aware
  accounting (each 50-recipient batch = 1 message against the 500/hour mailbox cap).
- Keeps the `pending_emails` overflow pattern for anything over the cap.

### Step 2 — Replace every Resend call site

All sending currently goes through `fetch("https://api.resend.com/emails", ...)` in
`apps/admin-api/index.ts`. Full inventory (line numbers as of this doc):

| Lines | Function / endpoint | Purpose |
|-------|---------------------|---------|
| 414–447 | `sendTokenEmail()` | Admin access-token email |
| 524–564 | `sendMeetEmail()` | New meet notification |
| 580–636 | `queueOrSendMeetEmails()` | Bulk meet emails (rate-limited loop) |
| 681–738 | `sendProjectAssignmentEmail()` | Project assigned to department leads |
| 747–796 | `sendRoleAssignmentEmail()` | Role assigned for a project |
| 804–850 | `sendRoleChangeEmail()` | Role updated |
| 2242–2255 | `sendWelcomeEmail()` | First newsletter subscription welcome |
| 2302–2315 | `sendWelcomeBackEmail()` | Re-subscribe welcome |
| 2351, 2365 | `POST /api/newsletter/subscribe` | Triggers the welcome emails above |
| 2616–2711 | `POST /api/newsletter/send` | Board bulk newsletter send |
| 2817–2843 | `POST /api/newsletter-editor/otp/send` | Newsletter editor OTP |
| 3064–3156 | `POST /api/newsletter-editor/send` | Editor bulk newsletter send |
| 3175–3256 | `POST /api/newsletter-editor/send-event` | Event announcement bulk send |
| 3410–3436 | `POST /api/letter-studio/otp/send` | Letter Studio OTP |
| 3816–3902 | `POST /api/letter-studio/send` | Letter PDF send |
| 9401–9434 | `POST /api/consulting-requests/:id/accept` | Consulting accept email |
| 9490–9530 | `POST /api/consulting-requests/:id/reject` | Consulting reject email |
| 9828–9919 | `POST /api/send-email` | Board/director arbitrary email |

### Step 3 — Secrets

`RESEND_API_KEY` is **kept** as the automatic fallback sender. Add the Spacemail pair:

| Secret | Value |
|--------|-------|
| `SPACEMAIL_SMTP_USER` | `technical@180dcvitc.org` (the authenticated mailbox) |
| `SPACEMAIL_SMTP_PASS` | that mailbox's password |

> **Sender ownership:** Spacemail rejects recipients with
> `553 5.7.1 Sender address rejected: not owned by user <mailbox>` if the envelope
> From is not owned by the authenticated mailbox. All templates send
> `From: ... <technical@180dcvitc.org>`, the authenticated mailbox itself, so no alias is
> required (verified live: MAIL FROM + RCPT accepted). If a friendlier sender address is
> wanted later, add it as an alias on this mailbox — otherwise `sendEmail()` rejects the
> recipients and automatically falls back to Resend, logging
> `Spacemail rejected N recipient(s), falling back to Resend`.

Set via `npx wrangler secret put` and mirrored in `.dev.vars`.

### Step 4 — Unsubscribe UX (superseded 2026-10-07)

Originally the BCC batches forced a shared `https://180dcvitc.org/unsubscribe` footer
link. Subscriber mail is now one message per recipient, so each email carries a
personal `https://180dcvitc.org/unsubscribe/<token>` link (token in
`newsletter_subscribers.unsubscribe_token`) plus one-click headers pointing at
`POST /api/newsletter/unsubscribe/:token`. The email-entry form on `UnsubscribePage.tsx`
remains as a fallback.

## The Ken-style newsletter plan (web-hosted content)

How The Ken works: the email carries a short teaser plus a "Read on theken.com" button;
the full article lives as a polished page on the website. The 180DC newsletter will do
the same — the email becomes a notification, and the full content is read on the site.

### What exists today

- `newsletters` table already stores full HTML `content`, `title`, `description`,
  `image_url`, `source_file_url` (`apps/admin-api/index.ts` schema).
- `GET /api/newsletter` (`index.ts:2421`) lists the last 10 newsletters but does **not**
  return `content`.
- `newsletterEmailHtml()` (`index.ts:1899`) embeds the full description in the email and
  its "Read on Website" CTA points at `https://180dcvitc.org/#newsletter` (a section
  scroll, not an article page).

### Phase A — Backend: public article endpoint

Add `GET /api/newsletter/:id` (public, rate-limited) returning:

```json
{
  "id": "...",
  "title": "...",
  "description": "...",
  "content": "<sanitized html>",
  "image_url": "...",
  "created_at": "..."
}
```

- Reuse the existing sanitization already applied on newsletter create
  (`INV-CONTENT-01` in `docs/domain/invariants.md`) — never serve raw content.
- Keep `GET /api/newsletter` (list) lightweight; do not add `content` to it.

### Phase B — Frontend: viewer + archive on the existing SPA (recommended)

Add to `apps/frontend` (Vite React SPA on Cloudflare Pages):

1. **Viewer page** `src/pages/NewsletterViewerPage.tsx` at route `/newsletter/:id`:
   - Fetches `GET /api/newsletter/:id` and renders a The-Ken-style article layout:
     branding header, title, date, description/dek, full content HTML, footer with
     subscribe + share links.
   - Register in `src/main.tsx` alongside `/subscriber`, `/unsubscribe`, etc.
2. **Archive page** `/newsletters`: lists all published editions from `GET /api/newsletter`,
   each linking to its viewer page.
3. **Email template rewrite**: `newsletterEmailHtml()` becomes a teaser — title,
   description preview, and one primary CTA button "Read the full newsletter" →
   `https://180dcvitc.org/newsletter/{id}`. PDF attachment becomes optional (archive
   only, not the primary read path).
4. **CSP check**: the viewer renders stored HTML that may carry inline styles — confirm
   `apps/frontend/functions/_middleware.ts` CSP permits them (style-src), and keep
   sanitization as the first line of defense.

### Phase C — Why the SPA, not a standalone Worker

- A standalone Worker serving HTML would work (`newsletter.180dcvitc.org` or a
  `180dcvitc.org/newsletter/*` route with a D1 binding) — deploy a Worker, bind D1, serve
  rendered pages. Nothing blocks it.
- But it duplicates the design system, CSP headers, SEO handling, and adds a second
  deploy pipeline for no functional gain here. The SPA route is one page component in
  the existing deploy; it is also what `/unsubscribe` and `/subscriber` already do.

### Phase D — Send flow after both changes

1. Editor saves/publishes newsletter (unchanged) → `newsletters.content` holds the HTML.
2. `POST /api/newsletter-editor/send` chunks active subscribers into 50-recipient BCC
   batches → SMTP via `sendEmail()` → each subscriber gets the teaser + link.
3. CTA points to `https://180dcvitc.org/newsletter/{id}` → SPA viewer renders the full
   article to anyone (public archive), same as The Ken's public article pages.
4. Event mails (`send-event`) stay as-is in format but also ship through `sendEmail()`
   and link to the site.

## Docs to update when this is implemented

- `NEWSLETTER_EDITOR.md` — replace the "Resend Configuration" section with Spacemail
  details.
- `docs/contracts/api-contract.md` — add `GET /api/newsletter/:id`.
- `docs/domain/business-logic.md` — BCC batching rule, 500/hour accounting, unsubscribe
  form change.
- `docs/operations/deployment.md` — new secrets, SMTP note.
- `docs/execution/current-state.md` — mark SES ADR as superseded by Spacemail.