import { people, personStatusHistory } from '@schema';
import { getTableColumns } from 'drizzle-orm';
import { asc, db, eq } from 'void/db';
import type { PersonStatus } from '../../db/schema/people';

export interface StatusChange {
  personId: string;
  from: PersonStatus | null;
  to: PersonStatus;
  reason: string | null;
  effectiveOn: string;
  actorPersonId: string | null;
}

/** The history row for one transition, unexecuted so it can join the batch that makes the change. */
export function statusHistoryInsert(change: StatusChange) {
  return db.insert(personStatusHistory).values({
    personId: change.personId,
    fromStatus: change.from,
    toStatus: change.to,
    reason: change.reason,
    effectiveOn: change.effectiveOn,
    actorPersonId: change.actorPersonId,
  });
}

export function statusHistoryFor(personId: string) {
  return db.select({ ...getTableColumns(personStatusHistory), actorName: people.fullName })
    .from(personStatusHistory).leftJoin(people, eq(people.id, personStatusHistory.actorPersonId))
    .where(eq(personStatusHistory.personId, personId)).orderBy(asc(personStatusHistory.id));
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function sqlNow(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}
