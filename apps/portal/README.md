# apps/portal — 180DC members portal (Void rewrite)

The rewrite of the members portal as a [Void](https://void.cloud) app in SPA + API mode. See
[ADR-007](../../docs/architecture/decisions/007-void-portal-rewrite.md). Production still runs `apps/admin-api` +
`apps/frontend` until the cutover PR.

Void's version-matched docs live in `node_modules/void/docs/`. The `void` agent skill points at them.

## Layout

| Path | What lives there |
| --- | --- |
| `routes/api/**` | One file per URL. Named exports `GET`/`POST`/`PATCH`/`PUT` (`[id]` becomes a parameter). |
| `middleware/01.principal.ts` | Resolves the Better Auth session to the signed-in person and their permissions on every `/api/*` request. |
| `auth.ts` | Better Auth config: Google only, invite-only sign-up, no sessions without access. |
| `db/schema/*.ts` | Drizzle tables. `org` covers departments, terms and positions; `access` covers roles; `people` covers people, grants, tenures and audit. |
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
| `GET /api/people/:id` | `people.view` or yourself; includes tenure history |
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
| `GET /api/departments` | signed in |
