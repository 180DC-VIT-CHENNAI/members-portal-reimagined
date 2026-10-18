# ADR-010 - Portal collaboration without additional services

Status: decided for implementation, 2026-10-18.

## Context

The live portal already has personnel permissions, versioned tasks, meetings, D1 campaign delivery and private R2 storage. Everyday follow-through was missing, while separate department/client project workflows duplicated user concepts.

## Decision

Use canonical projects for both client and internal work. An explicit internal flag prevents public publication. Internal work retains the old workspace audience: workspace readers/managers and explicitly named project members, not every person in a department. Copy existing portal department records additively, retain the source table and source identifiers, and adapt old routes. Existing legacy Worker data is not imported.

Store in-app notifications and onboarding acknowledgments in the portal D1. Assignment/comment notices commit with their source mutations; one hourly cron derives idempotent due-date notices. Meeting action items link existing tasks instead of introducing another task system. Contextual attachments use the existing bucket adapter and inherit project authorization.

Keep configured B2 failover behavior. Simplify its caller to wrap only the requested bucket; do not disable an operational capability as a code-cleanup side effect. Scheduled backups and explicit recovery drills remain independent requirements.

## Alternatives considered

- Keep two project editors: smaller migration, but repeats permissions and leaves department work without task/file workflows.
- Add a notification service or real-time transport: no requirement justifies a second delivery system.
- Remove live failover: less code, but changes configured outage behavior without operational evidence.

## Consequences

One project workflow reduces UI duplication. Explicit internal publication checks become load-bearing and require adversarial tests. D1-to-R2 operations are not transactional: metadata deletes atomically enqueue primary object keys through a trigger, and a five-minute cron drains those keys. A failed drain retains the intent. This uses no additional service; backup retention remains independent. Inbox freshness is on navigation/focus/refresh, not real-time push.

## Compatibility and migration

The migration adds tables/columns and preserves existing data. Existing client publication defaults and pending/completed task requests stay valid; old department IDs remain resolvable. No destructive table rebuild, production write, external mail or deployment is part of local verification.

## Reconsider when

Measured task/reminder volume exceeds bounded database queries, users need immediate push updates, or an approved availability requirement changes the storage recovery trade-off.
