import { people, positions, tenures } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db, eq } from 'void/db';
import { audit } from '../../../../src/server/audit';
import { requirePermission } from '../../../../src/server/guard';
import { badRequest, idParam, notFound } from '../../../../src/server/http';
import { isoDate } from '../../../../src/server/validation';

/** Close a tenure (the person stepped down from that position). */
export const POST = defineHandler.withValidator({ body: v.object({ endedOn: v.optional(isoDate) }) })(async (c, { body }) => {
  const [row] = await db
    .select({ tenure: tenures, positionDept: positions.departmentId, personDept: people.departmentId })
    .from(tenures)
    .innerJoin(positions, eq(positions.id, tenures.positionId))
    .innerJoin(people, eq(people.id, tenures.personId))
    .where(eq(tenures.id, idParam(c)));
  if (!row) notFound('tenure_not_found');
  const actor = requirePermission(c, 'people.edit', row.positionDept ?? row.personDept);
  if (row.tenure.endedOn) badRequest('tenure_already_ended');
  const endedOn = body.endedOn ?? new Date().toISOString().slice(0, 10);
  if (endedOn < row.tenure.startedOn) badRequest('ends_before_start');
  await db.update(tenures).set({ endedOn }).where(eq(tenures.id, row.tenure.id));
  await audit(actor.person.id, 'tenure.end', 'person', row.tenure.personId, { tenureId: row.tenure.id, endedOn });
  return { id: row.tenure.id, endedOn };
});
