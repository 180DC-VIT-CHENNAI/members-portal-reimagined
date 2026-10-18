# Documentation Index

This repository is documented as an agent-first knowledge system. Start with `AGENTS.md`, then use this index to load only the documents relevant to the task at hand.

## Document map

| Document | Purpose |
|----------|---------|
| `AGENTS.md` | Primary entry point, project mode, commands, hazards, update rules. |
| `README.md` | High-level overview, quick start, and links to the docs tree. |
| `docs/product/product-spec.md` | Product capabilities, actors, and current/target scope. |
| `docs/domain/business-logic.md` | Domain behavior by capability: actors, rules, workflows, state changes. |
| `docs/domain/invariants.md` | Properties that must never become false, with enforcement and verification notes. |
| `docs/architecture/system-architecture.md` | Runtime architecture, components, request flows, and data flow. |
| `docs/architecture/decisions/README.md` | Index of architecture decision records and how to add new ones. |
| `docs/contracts/data-model.md` | Canonical D1 schema, entity relationships, and migration notes. |
| `docs/contracts/api-contract.md` | API route inventory by domain, with auth and behavior notes. |
| `docs/execution/current-state.md` | What is implemented today, what is a placeholder, and known discrepancies. |
| `docs/execution/implementation-plan.md` | How to safely evolve the system, phase dependencies, and exit criteria. |
| `docs/execution/portal-port-plan.md` | Slice-by-slice plan for porting every admin-api feature into the Void portal (`apps/portal`), what the personnel system replaces, and the cutover. |
| `docs/execution/unified-platform-plan.md` | Earlier web/Android roadmap (personal Cloudflare ownership, database evaluation, acceptance gates). Background only: web delivery now follows the portal port plan. |
| `docs/execution/unified-baseline-audit.md` | Initial source permission/resource matrix, verified portability increment and gaps to resolve before guests/mobile. |
| `docs/compatibility/compatibility-contracts.md` | Public API, auth, and data compatibility surfaces. |
| `docs/quality/testing-strategy.md` | How to verify the system today and what tests are missing. |
| `docs/operations/deployment.md` | Build, development, deployment, and environment instructions. |
| `docs/operations/BUILD_AND_DEPLOY.md` | Build and deployment instructions for the whole workspace. |
| `docs/operations/NEWSLETTER_EDITOR.md` | Newsletter editor subsystem: auth, endpoints, templates, gotchas. |
| `docs/operations/SPACEMAIL_SETUP.md` | Spacemail migration: DNS fix, SMTP send architecture, Ken-style newsletter plan. |
| `docs/operations/SES_SETUP.md` | Earlier Amazon SES plan (superseded by Spacemail, kept for history). |
| `docs/design/DESIGN.md` | Visual and UX design constraints. |
| `docs/design/plan.md` | Frontend design plan and constraints. |
| `docs/product/REPORT.md` | Plain-English feature inventory and product narrative. |

## Task-based context routers

### Adding or changing an API endpoint

1. `docs/product/product-spec.md` — confirm the capability and actor.
2. `docs/domain/business-logic.md` — find the domain rules for the area.
3. `docs/domain/invariants.md` — identify invariants that may be affected.
4. `docs/contracts/api-contract.md` — add or update the route.
5. `docs/contracts/data-model.md` — update if persistence changes.
6. `docs/compatibility/compatibility-contracts.md` — if the route is public or used by clients.
7. `apps/admin-api/index.ts` — implement.

### Changing the database schema

1. `docs/contracts/data-model.md` — current schema.
2. `docs/domain/invariants.md` — integrity constraints.
3. `apps/admin-api/index.ts` — `ensureTables` and `runMigrations` are the canonical schema source.
4. `docs/execution/implementation-plan.md` — migration/backfill plan if existing data is affected.
5. `docs/contracts/api-contract.md` — affected endpoints.
6. `docs/compatibility/compatibility-contracts.md` — compatibility window.

### Changing authentication or authorization

1. `docs/product/product-spec.md` — actors and roles.
2. `docs/domain/business-logic.md` — auth flows.
3. `docs/domain/invariants.md` — auth invariants.
4. `docs/contracts/api-contract.md` — auth column for all routes.
5. `docs/architecture/system-architecture.md` — trust boundaries.
6. `docs/compatibility/compatibility-contracts.md` — token, Google sign-in and Clerk-removal compatibility.

### Changing the frontend

1. `docs/design/DESIGN.md` and `docs/design/plan.md` — visual and UX constraints.
2. `docs/product/product-spec.md` — relevant capability.
3. `docs/domain/business-logic.md` — workflow.
4. `docs/contracts/api-contract.md` — routes the UI calls.
5. `apps/frontend/` — implement.

### Refactoring existing backend code

1. `docs/execution/current-state.md` — current implementation notes and hazards.
2. `docs/architecture/system-architecture.md` — component responsibilities.
3. `docs/domain/invariants.md` — rules that must survive refactoring.
4. `docs/quality/testing-strategy.md` — add characterization tests if coverage is weak.
5. `apps/admin-api/index.ts` — refactor.

### Replacing a subsystem (e.g., public-api or job-processor)

1. `docs/execution/current-state.md` — why it is a placeholder.
2. `docs/architecture/system-architecture.md` — current and target architecture.
3. `docs/contracts/api-contract.md` — affected contracts.
4. `docs/execution/implementation-plan.md` — migration plan.
5. `docs/compatibility/compatibility-contracts.md` — compatibility requirements.
6. `docs/quality/testing-strategy.md` — verification strategy.

### Changing infrastructure or deployment

1. `docs/architecture/system-architecture.md` — topology.
2. `docs/operations/deployment.md` — build and deploy commands.
3. `apps/*/wrangler.toml` — current bindings and routes.
4. `docs/execution/implementation-plan.md` — rollout order.

## Stable identifiers used across documents

| Prefix | Meaning |
|--------|---------|
| `CAP-*` | Product capability |
| `RULE-*` | Business rule |
| `INV-*` | Invariant |
| `ADR-*` | Architecture decision record |
| `API-*` | Major API operation |
| `DATA-*` | Data model entity or relationship |
| `TEST-*` | Important verification case |
| `MIG-*` | Migration step or constraint |
| `COMP-*` | Compatibility requirement |

Use the identifiers when cross-referencing between documents.

- [ADR-005: Personal database evaluation](architecture/decisions/005-personal-database-evaluation.md) — development decision, current provider sources, migration correctness and hosted capacity gates.

- [ADR-006: Android foundation](architecture/decisions/006-android-client-foundation.md)
- [Mobile capability evidence](execution/mobile-capability-matrix.md)
