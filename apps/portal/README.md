# apps/portal — 180DC members portal (Void rewrite)

The rewrite of the members portal as a [Void](https://void.cloud) app in SPA + API mode. See
[ADR-007](../../docs/architecture/decisions/007-void-portal-rewrite.md). Production still runs `apps/admin-api` +
`apps/frontend` until the cutover PR.

Void's version-matched docs live in `node_modules/void/docs/`. The `void` agent skill points at them.

## Layout

| Path | What lives there |
| --- | --- |
| `routes/api/**` | One file per URL. Named exports `GET`/`POST`/`PATCH`/`PUT` (`[id]` becomes a parameter). |
| `src/server/guard.ts` | `requirePrincipal` / `requirePermission`: resolve the Better Auth session to the signed-in person and their permissions (once per request). There is deliberately no `middleware/` directory: global middleware makes Void run the Worker before every static asset, so the SPA would stop being served free from Workers Assets. |
| `auth.ts` | Better Auth config: Google only, invite-only sign-up, no sessions without access. |
| `db/schema/*.ts` | Drizzle tables. `org` covers departments, terms and positions; `access` covers roles; `people` covers people, grants, tenures and audit; `content` covers case studies, partners, consulting requests, announcements, maintenance mode and rate limits; `workspace` covers department documents, instructions and department projects. Files are not in D1: they live in R2 buckets in the deploy account (`CLUB_FILES`, `CASE_STUDIES`, `GALLERY_CDN`, bound by name in `void.config.ts`; commit `void.lock.json` whenever bindings change), with writes mirrored to Backblaze B2 and reads falling back to it when `B2_*` secrets are set (`src/server/buckets.ts`). |
| `db/migrations/` | Generated SQL (`void db generate`) plus seeded reference data. Applied by Void on deploy and at dev start. |
| `src/server/` | Server logic shared by routes: permissions, guards, lifecycle, CSV, sign-in rules, audit. |
| `src/` | The React SPA. |
| `tests/e2e/` | API end-to-end suite (`node:test`), run against a fresh local D1. |

## Commands

```bash
pnpm --filter portal dev         # local app + API on http://localhost:5173 (migrations apply on start)
pnpm --filter portal build       # production build (about 3 s)
pnpm --filter portal typecheck   # void prepare + tsc
pnpm --filter portal test:unit   # pure logic: permissions, lifecycle, CSV
pnpm --filter portal test:e2e    # starts its own dev server on a temp database
```

Local development needs `apps/portal/.env` (gitignored) with `AUTH_GOOGLE_CLIENT_ID` and `AUTH_GOOGLE_CLIENT_SECRET`.
For real Google sign-in locally, the OAuth client must allow `http://localhost:5173/api/auth/callback/google`.

The e2e harness signs people in by creating real Better Auth `user`/`session` rows in the temp database and signing the
cookie with Void's development secret. The app has no test login of any kind.

## Patched dependency

`patches/void@1.1.0.patch` (repo root, applied by pnpm) stops Void's asset fallback from replacing `/api/*` GET 404s with the SPA's `index.html`. Without it an unknown API route or a missing file answered `200 text/html`, contrary to Void's documented behaviour. Drop the patch when upgrading to a Void release that fixes this, and keep the `404` assertions in `tests/e2e/files.test.mjs` passing.

## Deployment (CI/CD)

`.github/workflows/portal-ci.yml` checks every PR. On a push to `main` it runs `void deploy --platform cloudflare`, which:
- builds the app;
- applies new D1 migrations;
- uploads the `180dc-portal` Worker and verifies the version before sending it traffic, rolling back if that check fails.

Setup (once):
- Repository secrets `PORTAL_CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. The token needs Workers Scripts Edit and D1 Edit on the account. It is separate from `CLOUDFLARE_API_TOKEN`, which the backup workflow uses.
- Worker secrets `AUTH_GOOGLE_CLIENT_ID` and `AUTH_GOOGLE_CLIENT_SECRET`, set with `void secret put`. Void creates `BETTER_AUTH_SECRET` itself.
- The Google OAuth client must allow `https://<portal host>/api/auth/callback/google`.
- The first deploy runs from one machine. Commit the `void.lock.json` it writes, then set the repo variable `PORTAL_DEPLOY=enabled`. The deploy job fails if a deploy changes `void.lock.json` without the change being committed.
- Readiness is checked on the new version's preview URL, so `workers_dev` and `preview_urls` are on and CI sets `CLOUDFLARE_WORKERS_SUBDOMAIN=srijan-guchhait`. On a brand-new Worker these settings only apply after the first activation. If the first `void deploy` stops because a preview URL is missing, run `pnpm -w exec wrangler triggers deploy -c "$PWD/.void-wrangler.jsonc"` once, then deploy again.

The portal is live at https://180dc-portal.srijan-guchhait.workers.dev. Its D1 database is `180dc-portal-db`. Production (180dc.vitcc.org) stays on the old Worker until the cutover.

Static files are served by Workers Assets and do not invoke the Worker. Only `/api/*` and `/__void/*` run it. Do not add files under `middleware/`: any global middleware makes Void run the Worker before every asset. Resolve per-request state in `src/server/guard.ts` instead.

## Access model

- **Status** (`people.status`) decides whether someone can sign in at all:
  - `active` and `on_leave` keep access.
  - `invited` becomes `active` on the person's first Google sign-in with that verified email.
  - `alumni` and `removed` lose access on their next request, and their sessions are deleted.
  - People are never deleted.
- **Permissions** are keys in `src/server/permissions.ts`. A person's permissions are:
  - the grants of their access role, each with scope `global` or `department` (department scope means the person's own department);
  - plus personal grants, each global or limited to one department.
- **Positions** are titles (per department or club-wide) recorded as tenures per term. They never grant access.

To add a permission:
1. Add the key to `PERMISSIONS`.
2. Grant it to roles in a new migration.
3. Check it in the route with `requirePermission(c, 'key', departmentId)`.

## API

| Method and path | Permission |
| --- | --- |
| `GET /api/me` | signed in |
| `GET /api/people?q&status&department&role&position&term` | `people.view` (private fields need `people.view_private` or being yourself) |
| `POST /api/people` | `people.invite` for the department. A role other than `member` also needs `people.grants`. |
| `GET /api/people/:id` | `people.view` or yourself; includes tenure history, and `grants` (extra permissions) only for viewers with `people.grants`, otherwise `null` |
| `PATCH /api/people/:id` | yourself (profile fields) or `people.edit` for the department. Moving departments needs `people.edit` for both. |
| `POST /api/people/:id/status` | `people.lifecycle` for the department; not on yourself |
| `PUT /api/people/:id/access` | `people.grants`; not on yourself |
| `POST /api/people/:id/tenures`, `POST /api/tenures/:id/end` | `people.edit` for the position's department |
| `GET /api/positions`, `POST /api/positions`, `PATCH /api/positions/:id` | signed in to read; `positions.manage` for the department to write |
| `GET /api/terms`, `POST /api/terms`, `POST /api/terms/:id/start` | signed in to read; `terms.manage` to write |
| `GET /api/access-roles`, `PUT /api/access-roles/:id` | signed in to read; `roles.manage` to write. The `admin` role is fixed. |
| `GET /api/exports/people` | `people.export` (rows limited to the departments you may export) |
| `POST /api/imports/people` | `people.import`; `{ csv, dryRun }` with columns `email,full_name,department,position,access_role` |
| `GET /api/audit` | `audit.view` |
| `GET /api/departments` | public (100/min per IP): id, name, description, active |
| `GET /api/departments/:id/members` | `departments.members.view` for that department. People whose home department it is, active or on leave, with their current-term positions. |
| `GET /api/departments/:id/instructions` | `departments.instructions.view` for that department |
| `POST /api/departments/:id/instructions`, `DELETE /api/departments/:id/instructions/:instructionId` | `departments.instructions.manage` for that department |
| `GET /api/departments/:id/overview` | `departments.workspace.view` for that department: documents, instructions and department projects |
| `POST /api/departments/:id/documents`, `DELETE /api/departments/:id/documents/:documentId` | `departments.documents.manage` for that department (links only; http(s) URLs) |
| `POST /api/departments/:id/projects`, `PUT /api/departments/:id/projects/:projectId/status` | `departments.projects.manage` for that department. This tracker is separate from club-wide projects. |
| `GET /api/content/case-studies`, `GET /api/content/partners`, `GET /api/content/team-members` | public (rate limited 100/min per IP). Team lists active/on-leave people with an open current-term tenure; public fields only. |
| `POST /api/consulting-request` | public (1 per hour per IP) |
| `GET /api/consulting-requests`, `DELETE /api/consulting-requests/:id`, `POST /api/consulting-requests/:id/accept`, `POST /api/consulting-requests/:id/reject` | `consulting.manage`. Replies are recorded; emailing them arrives with the email queue. |
| `GET /api/case-studies`, `POST /api/case-studies`, `PUT /api/case-studies/:id` | `content.publish` |
| `DELETE /api/case-studies/:id` | `content.manage` |
| `POST /api/partners`, `PATCH /api/partners/:id`, `DELETE /api/partners/:id` | `content.manage` |
| `GET /api/announcements` | signed in |
| `POST /api/announcements`, `DELETE /api/announcements/:id` | `announcements.manage` |
| `GET /api/admin/maintenance` | public |
| `POST /api/admin/maintenance` | `site.maintenance`. While on, signed-in API calls return 503 `maintenance` for anyone without it; public routes stay up. |
| `GET /api/club-files?category&eventName&projectName&search`, `GET /api/club-files/events`, `GET /api/club-files/projects`, `GET /api/club-files/:id/download` | `files.view`. Only the `general/`, `projects/` and `events/` prefixes of `CLUB_FILES` are listed or served. |
| `POST /api/club-files/upload` (multipart), `DELETE /api/club-files/:id` | `files.manage` (20/hour each). 25 MB limit and an extension allow-list. |
| `POST /api/case-studies/upload-image`, `upload-source`, `upload-document` (multipart); `DELETE /api/case-studies/delete-image` | `content.publish`. `upload-document` turns a PDF or DOCX into sanitized HTML and stores nothing. |
| `GET /api/case-studies/images/*` | public (200/min per IP): `images/` and `source/` keys of `CASE_STUDIES` |
| `GET /api/gallery-cdn/*` | public, cached for a year: photos in the `GALLERY_CDN` bucket listed by `src/data/galleryManifest.json` |
