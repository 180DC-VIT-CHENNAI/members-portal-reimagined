# Architecture Decisions

This directory records decisions that future agents should understand before changing the system.

## Existing decision records

| ADR | Document | Status | Summary |
|-----|----------|--------|---------|
| ADR-001 | `docs/architecture/backend-architecture-cloudflare.txt` | HISTORICAL/ASPIRATIONAL | Early design proposing Cloudflare Access, Next.js/Astro, separate public API with KV caching, Zod validation, and presigned R2 uploads. This was not implemented. |
| ADR-002 | `architecture/NEWSLETTER_BULK_SEND_DECISION.md` | SUPERSEDED | Chose Amazon SES for bulk newsletter sends, keep Resend for transactional. Superseded by the Spacemail SMTP migration (`docs/operations/SPACEMAIL_SETUP.md`), which keeps Resend as fallback. |
| ADR-003 | `architecture/TEAM_INSTANCES_PLAN.md` | IMPLEMENTED | Team instances feature for events/case competitions with teams, member limits, and minimums. Implemented in `apps/admin-api/index.ts` and `TeamInstancesSection.tsx`. |
| ADR-004 | `docs/architecture/decisions/ADR-004-NEWSLETTER_SEPARATE_SITE.md` | DECIDED (PENDING IMPLEMENTATION) | Host the Ken-style newsletter viewer/archive in a separate repository and Cloudflare Pages site at `newsletter.180dcvitc.org`, reading public `admin-api` endpoints. Supersedes the SES-only plan for the newsletter surface. |

| ADR-005 | `005-personal-database-evaluation.md` | DECIDED FOR DEVELOPMENT; PRODUCTION PROVISIONAL | Retain two D1 databases while developing; evaluate PlanetScale Postgres/MySQL with correctness, capacity, cost and migration gates before any cutover. |

| ADR-006 | `006-android-client-foundation.md` | DECIDED FOR INITIAL CLIENT | Expo Android member client on shared custom sessions/APIs; native storage, device acceptance and complete capability parity remain release work. |

## How to add a new ADR

Create a new file under `docs/architecture/decisions/` named `NNN-short-title.md` with:

- Title
- Status: proposed / decided / deprecated / superseded
- Context: what problem or question the decision addresses
- Decision: the chosen approach
- Alternatives considered
- Consequences: positive, negative, and risks
- Compatibility impact
- Migration impact
- Conditions for reconsideration

Link the new ADR in this README and update `docs/INDEX.md` if it changes the architecture router.

## Important note on ADR-001

`docs/architecture/backend-architecture-cloudflare.txt` predates the current implementation. It describes a more complex architecture than what is deployed. Do not use it as the current source of truth. The actual implementation is documented in:

- `docs/architecture/system-architecture.md`
- `docs/execution/current-state.md`
- `apps/admin-api/index.ts`
- `apps/frontend/functions/_middleware.ts`

Agents should read ADR-001 only to understand early intent and what was deliberately not built.
