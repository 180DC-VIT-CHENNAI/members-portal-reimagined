import { people, positions, tenures, terms } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { asc, db, eq } from 'void/db';
import { requirePermission } from '../../src/server/guard';
import { notFound } from '../../src/server/http';
import { id } from '../../src/server/validation';

/**
 * The organisation for one term (the current term by default): every tenure
 * with its position, holder and reports-to link, by position rank. Clients
 * build the tree from `reportsToPersonId`.
 */
export const GET = defineHandler.withValidator({ query: v.object({ term: v.optional(id) }) })(async (c, { query }) => {
  await requirePermission(c, 'people.view');
  const [term] = await db.select().from(terms).where(query.term ? eq(terms.id, query.term) : eq(terms.isCurrent, true));
  if (!term) notFound('term_not_found');
  const nodes = await db
    .select({
      tenureId: tenures.id,
      personId: people.id,
      fullName: people.fullName,
      photoKey: people.photoKey,
      status: people.status,
      positionId: positions.id,
      title: positions.title,
      departmentId: positions.departmentId,
      rank: positions.rank,
      reportsToPersonId: tenures.reportsToPersonId,
      startedOn: tenures.startedOn,
      endedOn: tenures.endedOn,
    })
    .from(tenures)
    .innerJoin(people, eq(people.id, tenures.personId))
    .innerJoin(positions, eq(positions.id, tenures.positionId))
    .where(eq(tenures.termId, term.id))
    .orderBy(asc(positions.rank), asc(people.fullName));
  return { term: { id: term.id, label: term.label, isCurrent: term.isCurrent }, nodes };
});
