# admin-api test suite

End-to-end tests for every route in `apps/admin-api`. Each run starts the worker
locally with `wrangler dev` on a **fresh, empty local database**. It creates one
account per role and then drives the API the way the website does. Nothing
touches production.

## Running

```bash
pnpm install                     # once
pnpm test                        # everything; emails are captured, none are sent
TEST_EMAIL=you@example.com pnpm test:mail   # same, but real emails go to you
```

Useful flags (put them after `--`):

| Flag | What it does |
|------|--------------|
| `--only <regex>` | Run matching test files, e.g. `pnpm test -- --only newsletter` |
| `--grep <regex>` | Run only tests whose name matches, e.g. `--grep "retry"` |
| `--log` | Show the worker's own output (handy when a test fails) |

A full run takes about two minutes.

Run it after every change to `apps/admin-api/index.ts`. A test marked
`# TODO` is a known bug (listed below): it runs and reports, but doesn't fail
the run.

## How emails work in tests

The worker supports a **dev-only** `EMAIL_TEST_MODE`. Production ignores it
(`ENVIRONMENT=production` turns it off, and `18-email-test-mode` checks that):

- **`pnpm test`** (`capture`): every email is recorded in a local `dev_outbox`
  table and nothing is sent. Tests read the outbox through
  `GET /api/dev/outbox` to check recipients, subjects, bodies, unsubscribe
  links and headers, and to pick up OTP codes.
- **`pnpm test:mail`** (`redirect`): the same, but the **first email of each
  subject** is also delivered through Spacemail to `TEST_EMAIL`, with
  `[TEST to <original recipient>]` added to the subject. Later emails with the
  same subject are only recorded, so a club-wide meet doesn't flood your
  inbox. Use this to see what members actually receive. It needs
  `SPACEMAIL_SMTP_USER` / `SPACEMAIL_SMTP_PASS` in `apps/admin-api/.dev.vars`.
  Real people are never emailed: every message goes to `TEST_EMAIL`.

Test accounts use `@test.180dcvitc.org`, which never receives mail. A few
special domains simulate Spacemail failures in both modes:

| Recipient | Behaves like |
|-----------|--------------|
| `*@reject.invalid` | `550` rejection at `RCPT TO`: recipient marked failed |
| `*@tempfail.invalid` | `450` rejection at `RCPT TO`: recipient marked failed, queue moves on |
| `*@timeout.invalid` | the whole SMTP session times out: campaign stays queued |

## What is covered

| File | Feature |
|------|---------|
| `00-harness` | Setup sanity, outbox, per-IP rate-limit isolation |
| `01-auth` | Token login, dev login, forgot token, rotate token, admin tokens, Google (Clerk) login guards |
| `02-members-roles` | Adding members/directors/advisory, roles, role changes, user lists by role, directory, CSV export, removing members, dashboard per role |
| `03-role-transfers` | Board-approved and two-party role handovers |
| `04-signup-requests` | Public account request form and board approval |
| `05-departments` | Department hub: overview, documents, instructions, projects, members, department meets, access control |
| `06-meets` | Club-wide and inter-department meets, notification emails, re-sending, meet links hidden 24 h after the meet |
| `07-announcements` | Board announcements |
| `08-projects` | Projects, department visibility, project roles, tasks, completion, public completed list |
| `09-team-instances` | Instances, levels, groups, teams, member limits, outside members, moving members, statuses, activity log |
| `10-case-studies` | Publishing, sanitizing, PDF/DOCX import, images, source files |
| `11-consulting` | Public consulting form, board accept/reject emails |
| `12-send-mail` | Send Mail (board: anyone; directors: own department), queued bulk sends |
| `13-club-files` | Club file library upload/filter/download/delete |
| `14-newsletter-public` | Subscribe, welcome emails, personal and one-click unsubscribe, legacy links, archive |
| `15-newsletter-board` | Drafts, uploads, one email per subscriber, late-unsubscribe skip, failures, retry-failed, queue status |
| `16-newsletter-editor` | Editor OTP login, drafts, test sends, live sends, event mail, editor access |
| `17-letter-studio` | Letter Studio OTP login, access list, PDF upload/preview, emailing letters |
| `18-email-test-mode` | Test mode can't run in production |
| `19-security` | Security headers, CORS, CSRF, 401 on every member-only area |
| `20-public-content` | Public website data, gallery CDN, rate limits |
| `99-maintenance` | Maintenance mode lock-out (runs last) |

The frontend isn't covered here; browser tests are a separate follow-up.

## Known issues found by the suite

`tests/lib/known-issues.mjs` lists bugs the suite has found but that aren't
fixed yet. Their tests are marked `{ todo: KNOWN.X }`: they run and report, but
don't fail the run. When you fix one, delete its entry and the `todo`, and the
test will guard against the bug coming back. The list is currently empty: the
five bugs the suite first found (department access checks not awaited, DOCX
import, the maintenance cache, editor draft ownership, and the shadowed
`/api/newsletter/admin` route) are fixed and now have strict tests.

Smaller issues noticed while writing the tests (no test yet):

- Some board-only routes return **500** instead of 403 when a non-board user
  calls them. The tests accept either, but only when the message says
  "Forbidden".
- `DELETE /api/case-studies/delete-image`: any member can delete any uploaded
  image or source file, including newsletter PDFs. `PUT /api/case-studies/:id`:
  any member can edit any case study.
- `PUT /api/members/:id/role` doesn't check that the role exists, so a typo
  locks the member out.
- Approving a signup request twice, or for an email that is already a member,
  fails with a raw database error instead of a clear message.
- Role-transfer approval doesn't check the level of the role being handed over.
- `/api/dashboard` shows every pending role transfer to every member.
- `GET /api/projects/:id/tasks` has no access check. Users without a
  department see every project.
- Club file uploads have no size or type limit.
- OTP codes are looked up by `created_at`, which has 1-second precision, and
  are generated with `Math.random()`.

## Adding a test

1. Put it in the file for its feature, or add `NN-feature.test.mjs`. Files run
   in name order, one at a time, against the same worker.
2. Use the helpers in `lib/api.mjs`: `get/post/put/del`, `tokens.<role>`
   (`board`, `board2`, `director` (marketing), `director2` (finance), `member`
   (marketing), `member2` (finance), `advisory`), `newMember()` for a
   throwaway account, `outboxMark()` + `waitForMail()` for emails,
   `drainUntilDone()` to run the queue, `subscribe()` and `otpLogin()`.
3. Don't change the shared accounts' roles or tokens. Create a throwaway
   account instead.
4. Each request gets its own fake client IP, so rate limits don't leak
   between tests. Pass `{ ip }` to test a limit on purpose.
