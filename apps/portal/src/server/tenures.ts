import { positions, tenures, terms } from '@schema';
import { and, db, eq } from 'void/db';
import { badRequest, conflict } from './http';

export type Position = typeof positions.$inferSelect;
export type Term = typeof terms.$inferSelect;

/** An active position, or 400 unknown_position. */
export async function activePositionOr400(positionId: string): Promise<Position> {
  const [position] = await db.select().from(positions).where(eq(positions.id, positionId));
  if (!position || !position.active) badRequest('unknown_position');
  return position;
}

/** The named term, or the current one; 400 unknown_term otherwise. */
export async function termOr400(termId: string | undefined): Promise<Term> {
  const [term] = await db.select().from(terms).where(termId ? eq(terms.id, termId) : eq(terms.isCurrent, true));
  if (!term) badRequest('unknown_term');
  return term;
}

/** 409 tenure_exists when the person already held this position in this term. */
export async function assertNoTenure(personId: string, positionId: string, termId: string): Promise<void> {
  const [dupe] = await db
    .select({ id: tenures.id })
    .from(tenures)
    .where(and(eq(tenures.personId, personId), eq(tenures.positionId, positionId), eq(tenures.termId, termId)));
  if (dupe) conflict('tenure_exists');
}

/** The tenure insert, unexecuted so callers can batch it with their own writes. */
export function tenureInsert(input: { id: string; personId: string; positionId: string; termId: string; startedOn: string }) {
  return db.insert(tenures).values(input);
}
