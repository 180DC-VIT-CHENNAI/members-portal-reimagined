# Newsletter Editor System

## Overview

Separate newsletter creation/sending system at `/subscriber/newsletter`, independent from the members portal. Uses OTP-based auth (not Clerk).

## Architecture

```
Members Board (/members)                 /subscriber/newsletter
─────────────────────────                 ──────────────────────
Newsletter panel (power >= 100):          OTP login → editor:
- Add/remove authorized emails            - Create/edit/delete drafts (Newsletters tab)
- Manages WHO can access the editor       - Send event announcements (Event Mail tab)
                                          - Upload PDF/Word → extract text
                                          - Send to all subscribers
```

## Auth Flow (OTP)

1. User enters email at `/subscriber/newsletter`
2. Backend checks authorization:
   - Is email in `newsletter_authorized_emails` table? → allowed
   - Is email a registered member with power_level != 30? → allowed
   - Otherwise → 403
3. 6-digit OTP sent through `sendEmail()` (Spacemail SMTP; expires 5 min)
4. User enters OTP → verified → 24h session token created
5. Session stored in `localStorage` as `nl_editor_session`

## Database Tables (`NEWSLETTER_DB`, `newsletter-db`)

These tables live in the separate `newsletter-db` D1 database (binding `NEWSLETTER_DB`).
The copies in `180dc-db` are frozen legacy backups. `ensureNewsletterTables` creates them.

```sql
newsletter_authorized_emails (email TEXT PRIMARY KEY, added_by TEXT, created_at DATETIME)
newsletter_otp_codes (id TEXT, email TEXT, code TEXT, expires_at DATETIME, used INTEGER)
newsletter_sessions (id TEXT, email TEXT, expires_at DATETIME)
newsletter_subscribers (id TEXT, email TEXT UNIQUE, active INTEGER)
newsletters (id TEXT, title TEXT, description TEXT, content TEXT, source_file_url TEXT, image_url TEXT, email_subject TEXT, sent_at DATETIME, recipient_count INTEGER)
```

## Backend Endpoints

All under `apps/admin-api/index.ts`.

### Public (no auth)
- `POST /api/newsletter-editor/otp/send` — send OTP to email
- `POST /api/newsletter-editor/otp/verify` — verify OTP, return session token

### OTP Session Auth (Bearer: session token)
- `GET /api/newsletter-editor/me` — check session
- `POST /api/newsletter-editor/logout` — destroy session
- `GET /api/newsletter-editor/drafts` — list own drafts
- `POST /api/newsletter-editor/drafts` — create/update draft
- `DELETE /api/newsletter-editor/drafts/:id` — delete own draft
- `POST /api/newsletter-editor/upload-source` — upload PDF/DOCX to R2
- `POST /api/newsletter-editor/send` — send newsletter to all subscribers
- `POST /api/newsletter-editor/send-event` — send event mail to all subscribers

### Admin (requires board power_level >= 100, uses admin token auth)
- `GET /api/newsletter-editor/admin/authorized-emails` — list authorized emails
- `POST /api/newsletter-editor/admin/authorized-emails` — add email
- `DELETE /api/newsletter-editor/admin/authorized-emails/:email` — remove email

### Existing Public Newsletter Endpoints (were broken, now fixed)
- `GET /api/newsletter` — list published newsletters (landing page)
- `GET /api/newsletter/:id` — single newsletter with sanitized `content` (used by the separate newsletter site, ADR-004)
- `POST /api/newsletter/subscribe` — subscribe to newsletter
- `POST /api/newsletter/unsubscribe/:token` — unsubscribe by the subscriber's token (used by `/unsubscribe/<token>` and one-click `List-Unsubscribe-Post`)
- `GET /api/newsletter/unsubscribe?email=...` — legacy unsubscribe for links in older emails
- `GET /api/newsletter/subscribers/count` — public count

## Frontend Files

| File | Purpose |
|------|---------|
| `apps/frontend/src/pages/NewsletterEditorPage.tsx` | OTP login + newsletter/event mail editor page |
| `apps/frontend/src/pages/SubscriberPage.tsx` | Public subscriber page (Clerk Google auth) |
| `apps/frontend/src/pages/UnsubscribePage.tsx` | Public unsubscribe page (`/unsubscribe?email=...`) |
| `apps/frontend/src/sections/NewsletterSection.tsx` | Landing page newsletter section |
| `apps/frontend/src/pages/members/NewsletterSection.tsx` | Members board — authorized email management only |
| `apps/frontend/src/main.tsx` | Routes: `/subscriber`, `/subscriber/newsletter`, `/unsubscribe` |

## Routes (main.tsx)

- `/subscriber` — Clerk-based subscriber page (Google sign-in, Terms & Conditions consent)
- `/subscriber/newsletter` — OTP-based newsletter/event mail editor (no Clerk)
- `/unsubscribe?email=...` — Public unsubscribe page (reads email from query param)

## Key Fixes Applied

### Auth Middleware (index.ts)
1. Added newsletter public routes to `isPublicRoute()`:
   - `POST /api/newsletter/subscribe`
   - `GET /api/newsletter/unsubscribe`
   - `GET /api/newsletter/subscribers/count`
2. Added `GET /api/newsletter` to public GET routes
3. OTP endpoints bypass admin token auth:
   ```typescript
   if (url.pathname.startsWith("/api/newsletter-editor/") && !url.pathname.startsWith("/api/newsletter-editor/admin/")) {
     await next(); return;
   }
   ```
4. Admin endpoints (`/api/newsletter-editor/admin/*`) still require board auth

### Wrangler Migration (wrangler.toml)
- Removed `[[migrations]]` block for ChatRoomDO — it was already deleted via dashboard
- Migration tags conflict with dashboard-deployed versions

## Environment Variables

| Variable | Location | Purpose |
|----------|----------|---------|
| `VITE_CLERK_PUBLISHABLE_KEY` | `apps/frontend/.env` | Clerk auth for subscriber page |
| `NEWSLETTER_SITE_URL` | `wrangler.toml` `[vars]` + `.dev.vars` | Base URL of the newsletter site (ADR-004): `https://180dc-newsletters.technical-vitc.workers.dev`. Bulk CTAs render `{url}/newsletter/{slug}`. |
| `SPACEMAIL_SMTP_USER` / `SPACEMAIL_SMTP_PASS` | Workers secrets + `.dev.vars` | The only email sender: authenticated mailbox `technical@180dcvitc.org` + password. All From addresses use this mailbox, so Spacemail's sender-ownership check passes. |
| `NEWSLETTER_DB` | D1 binding (`wrangler.toml`) | Separate `newsletter-db` database holding all newsletter tables. |

## Email Delivery

All sending goes through `sendEmail()` in `apps/admin-api/index.ts`:

- **Provider:** Spacemail SMTP is the only provider (no fallback) — at `mail.spacemail.com:465` (implicit TLS) via `cloudflare:sockets`, AUTH with the mailbox address + password.
- **Batching:** no queued campaign uses BCC. Newsletter and event campaigns send one personalized message per subscriber, 1.5 s apart, recording each result in `email_deliveries`; all other sends (Send Mail, project/role notices, OTPs, letters, tokens) are one recipient per message (`batchRecipients: false`).
- **Quota:** 500 SMTP messages/hour tracked in `email_hour_count`; the queue uses at most 90% of each hour so OTPs, login tokens and welcome mails always have room.
- **Bulk queue:** newsletter, event, meet, and Send Mail lists over 10 recipients insert one `email_queue` campaign and return immediately with `queued`/`total`. The `* * * * *` cron drains it with adaptive pacing (up to 15 messages/minute, capped at 500/hour), retries failed campaigns up to 5 times, and writes `sent_at`/`recipient_count` back to the newsletter row.
- **Failures:** temporary session errors (timeouts, dropped connections, 4xx before RCPT) leave the recipient queued for the next cron run; a rejected recipient (4xx/5xx at RCPT) or a permanent session error (5xx: bad credentials, sender not owned, content rejected) marks it `failed` in `email_deliveries`, retryable with `POST /api/admin/email-queue/:id/retry-failed`. A Spacemail "too many messages" rejection marks the hour as used up, so the queue pauses until the next hour.
- **From addresses:** all `technical@180dcvitc.org` — `180DC Newsletter <...>`, `180DC Events <...>`, `180DC Admin <...>`, `180DC Consulting <...>`, `180DC Letter Studio <...>`.
- **PDF attachments:** referenced from R2 by the queue and built into a multipart MIME message at send time.
- **Visibility:** `GET /api/admin/email-queue` (board token) returns hourly usage and recent campaigns.

## Email Templates

> **Authoring:** newsletter drafts store `content` as plain text or basic HTML
> (paragraphs are auto-wrapped and sanitized on save). The PDF/DOCX upload was removed for
> newsletters; the Event Mail tab keeps its poster/source uploads.
> Issues authored in the site repo (`public/data/{slug}.json`) are rendered into the mail
> as the full site layout (`issueToEmailHtml`); a seeded editorial-sync Issue 01 is shown
> in the editor drafts list via `scripts/sync-newsletter-content.mjs`.

All subscriber emails include a personal unsubscribe link and one-click `List-Unsubscribe` headers. Templates render `%%UNSUBSCRIBE_URL%%`, which the queue replaces per recipient:
```
To stop receiving emails from 180DC, click here to unsubscribe.
→ https://180dcvitc.org/unsubscribe/<unsubscribe_token>
```
Single-recipient emails (welcome / welcome-back) may keep `?email={subscriber_email}`.

### Newsletter Email (`newsletterEmailHtml`)
- 180DC VIT Chennai's newsletter is branded **"The Catalyst"**. Ken-style design matching the
  newsletter site: cream background, ink border + hard shadow card, Anton display type,
  "THE CATALYST" wordmark masthead, issue bar
- **Structured render:** when the site exposes `{site}/data/{slug}.json` for an issue, the mail embeds the **full site article layout** (`issueToEmailHtml`): masthead, issue bar, cover image, section kickers/titles, paragraphs, green quote boxes, stat cards, numbered lists, notes, plus the "Read it on the web" button and URL. Otherwise it falls back to the teaser + embedded `content` template.
- **Embeds the full article content** (sanitized) after the teaser, then the "Read on the web" CTA button plus the visible issue URL
- Unsubscribe footer
- CTA target: `{NEWSLETTER_SITE_URL}/newsletter/{id}` when the var is set, otherwise `https://180dcvitc.org/#newsletter`
- **Planned enhancement (skip while only one issue exists):** a "Check out our other issues"
  footer listing up to 3 other published issues as rectangular boxes linking to
  `{site}/newsletter/{slug}`; template param `otherIssues` was designed for it.

### Event Mail (`eventMailEmailHtml`)
- Dark header with green accent text
- "Upcoming Event" label (orange accent), title, description
- "Learn More" CTA button (orange) → `{NEWSLETTER_SITE_URL}` when set, otherwise the landing page
- Unsubscribe footer

### Welcome/Re-subscribe Emails
- Sent on first subscribe or re-subscribe
- Include unsubscribe link in footer

### Send Mail (members portal, `/api/send-email`)
- Uses a **plain personal template** (system fonts, no images/social footer) instead of the
  branded marketing shell. This keeps member/admin messages out of Gmail's Promotions tab
  and in Primary/Updates. Newsletter/event mail intentionally keeps the branded template
  (Promotions classification is expected for bulk marketing).

## Subscriber Terms & Conditions

The `/subscriber` page displays Terms and Conditions that include:
1. Consent to receive newsletter communications
2. Consent to receive event updates (workshops, seminars, promotional events)
3. Link to unsubscribe at `180dcvitc.org/unsubscribe`

## Deploy Commands

```bash
# Backend
cd apps/admin-api
npx wrangler deploy

# Frontend
cd apps/frontend
npm run build
# Then deploy to Cloudflare Pages
```

## Known Gotchas

1. **ChatRoomDO migration error**: Don't use migration tags if class was already deleted via Cloudflare Dashboard. Remove `[[migrations]]` block.
2. **Newsletter public routes**: Must be explicitly in `isPublicRoute()` or the auth middleware returns 401.
3. **Newsletter editor admin routes**: Must NOT bypass auth middleware — they need board-level auth for `requireBoard()`.
4. **Power level 30 exclusion**: OTP access is denied to members with power_level == 30. Everyone else (including non-members in the authorized list) can access.
