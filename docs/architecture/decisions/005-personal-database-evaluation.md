# ADR-005 — Personal deployment database evaluation

Status: decided for ongoing development; production capacity selection remains provisional.
Date: 8 October 2026.

## Context and evidence

The sponsor requires personal Cloudflare ownership and permits PlanetScale. Neither migration nor paid database provisioning is mandatory. Preserve live compatibility while building the unified web/Android platform.

A literal source inventory of the canonical Worker currently finds 451 `.prepare(` calls, seven `.batch(` calls, 58 `.exec(` calls, 26 `julianday(` occurrences, 14 `INSERT OR IGNORE` occurrences, five `changes()` occurrences and 26 `ALTER TABLE` occurrences. These are textual counts, not unique queries, actual invocation counts or production load measurements. Additional helpers contain SQL, including the persistent rate limiter. The placeholder shared schema must never be used as a migration source.

D1-backed identity, role/task visibility, status/audit batches, member removal and rate-limit concurrency/restart journeys have passed synthetic local Worker tests. Hosted D1 latency/load and PlanetScale parity have not been measured. No actual personal-account database has been provisioned by this work.

## Decision

Continue core development on the existing two-D1 topology, with isolated personal resources at deployment. Keep newsletter records separate. Use R2 for file bodies. Do not migrate databases or buy capacity solely to satisfy an optional provider preference.

Evaluate PlanetScale Postgres as the first migration candidate if measured storage, sustained write throughput, query features or recovery requirements justify it. This preference is an engineering judgment based on the relational/transactional workload, not a performance result. MySQL/Vitess remains a supported alternative and must be tested separately. Record a superseding production decision after the gates below; this ADR does not certify D1 capacity for future chat traffic.

## Alternatives and current provider facts

| Option | Fit | Main costs/limitations for this repository |
| --- | --- | --- |
| D1 | Existing SQLite queries/bindings and verified local journeys | Per-database capacity and serialized query execution; paid/free limits differ; indexing and write-heavy collaboration need measurement |
| PlanetScale Postgres + Hyperdrive | Managed regional relational store with native Postgres drivers | Translate SQLite SQL, D1 API and batch/audit semantics; add credentials/pooling and hosted recovery/latency tests |
| PlanetScale MySQL/Vitess + Hyperdrive | Supported managed MySQL option | Different upsert/returning/date semantics; validate constraints and deployment workflow, including documented sharding restrictions |

Cloudflare supports both PlanetScale engines through Hyperdrive; its native driver recommendation differs from the PlanetScale HTTP/serverless driver. Database charges remain separate from Hyperdrive charges. [Cloudflare integration](https://developers.cloudflare.com/hyperdrive/planetscale/), [driver guidance](https://developers.cloudflare.com/workers/databases/third-party-integrations/planetscale/), [Hyperdrive pricing](https://developers.cloudflare.com/hyperdrive/platform/pricing/).

As checked today, D1 Free includes 5 million rows read/day and 100,000 rows written/day; Paid includes 25 billion reads/month, 50 million writes/month and 5 GB storage before usage charges. Index updates also contribute to written rows. These are D1 allowances, not a full app cost estimate. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).

D1 maximum database size is 500 MB on Free and 10 GB on Paid; point-in-time recovery duration and invocation query limits also depend on plan. Each database executes queries serially. [D1 limits](https://developers.cloudflare.com/d1/platform/limits/).

PlanetScale advertises Postgres single-node pricing starting at $5/month for development/low traffic; this is not an HA production quote or an all-in hosting price. Choose region, availability, branch count, storage and plan in the current calculator before provisioning. [PlanetScale pricing](https://planetscale.com/pricing), [single-node availability](https://planetscale.com/changelog/single-node).

Do not repeat historical claims that PlanetScale has no foreign-key support. For Vitess, validate the exact enabled configuration and its constraints; sharded keyspaces have documented restrictions when foreign-key constraints are enabled. [PlanetScale sharding documentation](https://planetscale.com/docs/vitess/sharding/sharding-new-tables).

## Correctness gates and SQL translation

| Representative operation | D1 behavior to preserve | Migration work |
| --- | --- | --- |
| Session authentication and role changes | Current parent credential, revocation, expiry and role on every request | Preserve UTC comparisons and fresh security reads; never cache authorization decisions |
| Task status + audit | Conditional update and matching audit in one D1 batch; retries do not add audit | Explicit transaction with conditional update result/returning; replace connection-local `changes()` dependency |
| Member exit | Registry/identity deletion and cascaded sessions together | Foreign-key/cascade validation and transaction rollback tests |
| Rate limit | Atomic upsert/returning with SQLite UTC window and saturation | Dialect-specific atomic increment, expiry and returned count under contention |
| Project/meeting visibility | Shared membership predicate; exact department match; 24-hour link hiding | Bind parameter/date-function translation; reproduce negative fixtures |
| Campaign claiming, quotas and recovery | One authoritative campaign state, quota caps and retries | Transaction/locking/idempotency tests under competing workers; preserve separate newsletter ownership |

Do not substitute a generic ORM wrapper for these semantics. Extract repository interfaces incrementally with parity tests; retain the canonical Worker as the production entry point. Postgres uses positional parameters/date functions different from SQLite; MySQL has its own insert/upsert and returning behavior. Schema/data export must originate from runtime D1 schema and actual metadata, not the destructive placeholder SQL.

Hyperdrive query caching must be disabled for the connection used for authentication, membership, quotas and workflow state. It supports a cache-disabled configuration; caching read-only public assets can be a separately reviewed path. [Hyperdrive caching configuration](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/).

## Measurement and migration gates

1. Measure personal staging cold bootstrap and warmed requests against the chosen Workers/D1 plan; verify invocation query limits as well as storage. Local Wrangler success does not prove hosted plan limits.
2. Replay identical synthetic identity/task/meeting/campaign workloads against hosted D1 and each candidate. Capture p50/p95 latency, errors, rows read/written, transaction correctness and regional connection behavior. Do not infer hosted performance from a local Postgres container.
3. Test bursty task/chat writes, concurrent quota claims, source revocation and project-role removal. Security changes must affect the next request even when pooling/read caches are warm.
4. Rehearse separate main/newsletter export/import. Verify row counts, key relationships, UTC dates, nullability, identities, audits and campaign cursors. Omit real credentials from fixtures/logs.
5. Rehearse restore and rollback. Use one authoritative writer; drain/freeze writes for a cutover window, reconcile and switch the application. After candidate writes begin, reverting to an older D1 snapshot loses them unless reverse replay/reconciliation is proven. A DNS switch alone is not rollback.
6. Record actual region/HA/backup/storage/branch quote and spending ceiling before paid provisioning. Never create a Cloudflare-billed PlanetScale database as an unreviewed benchmark side effect.

Reconsider D1 when measured performance/recovery fails the agreed pilot acceptance targets, forecast storage approaches its plan cap, or workload features justify the translation cost. Pilot concurrency and latency targets still require measured evidence; no universal query-per-second target is asserted here.

## Immediate capacity task

Both Dashboard and Today poll once per visible minute. An illustrative 100 members active for two hours generate 24,000 poll requests/day; the same two endpoints with eight-hour member activity generate 96,000. Each rate-checked poll performs a D1 write, with additional index/business writes and query scans. These are workload arithmetic, not traffic observations. Measure actual D1 billing metadata before assuming the Free tier fits. Retention, query indexes, polling/backoff and budget alerts remain operational work.

## Consequences

Feature delivery can continue on a tested local backend without a premature data cutover. The two-database boundary and current SQLite coupling remain engineering obligations rather than being hidden behind a nominal provider switch. Hosted capacity evidence, row retention/index tuning and restore rehearsal are still necessary before release. A later PlanetScale migration will have a real translation and operational cost, and should replace this provisional selection only when its measured benefit supports that cost.

## Compatibility and migration impact

No binding, SQL dialect, record ownership or production data changes in this decision. Personal resources must remain distinct from club resources. Keep the existing additive schema/migrations and verified compatibility routes. Final database/mobile implementation and release checks remain part of the full platform goal.

Additional migration dependency from task history: timeline paging uses audit timestamps plus SQLite append row sequence to preserve insertion order within a second. A PostgreSQL/MySQL adapter must supply an explicit persisted append sequence and preserve existing ordering during export/import; replacing the tie-breaker with a random UUID would reorder events. Include multi-page same-second timeline parity in the migration gate.
