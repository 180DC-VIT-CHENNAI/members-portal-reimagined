import { positions, tenures, terms } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { and, db, eq } from 'void/db';
import { audit } from '../../../../src/server/audit';
import { requirePermission } from '../../../../src/server/guard';
import { badRequest, conflict, idParam } from '../../../../src/server/http';
import { getPersonOr404 } from '../../../../src/server/people';
import { id, isoDate } from '../../../../src/server/validation';

/** Give a person a position for a term (the current term by default). */
export const POST = defineHandler.withValidator({
  body: v.object({ positionId: id, termId: v.optional(id), startedOn: v.optional(isoDate) }),
})(async (c, { body }) => {
  const person = await getPersonOr404(idParam(c));
  const [position] = await db.select().from(positions).where(eq(positions.id, body.positionId));
  if (!position || !position.active) badRequest('unknown_position');
  const actor = await requirePermission(c, 'people.edit', position.departmentId ?? person.departmentId);

  const [term] = await db
    .select()
    .from(terms)
    .where(body.termId ? eq(terms.id, body.termId) : eq(terms.isCurrent, true));
  if (!term) badRequest('unknown_term');
  const [dupe] = await db
    .select({ id: tenures.id })
    .from(tenures)
    .where(and(eq(tenures.personId, person.id), eq(tenures.positionId, position.id), eq(tenures.termId, term.id)));
  if (dupe) conflict('tenure_exists');

  const tenureId = crypto.randomUUID();
  await db.insert(tenures).values({
    id: tenureId,
    personId: person.id,
    positionId: position.id,
    termId: term.id,
    startedOn: body.startedOn ?? new Date().toISOString().slice(0, 10),
  });
  await audit(actor.person.id, 'tenure.add', 'person', person.id, { positionId: position.id, termId: term.id });
  return c.json({ id: tenureId }, 201);
});
