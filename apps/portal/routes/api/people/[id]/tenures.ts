import * as v from 'valibot';
import { defineHandler } from 'void';
import { audit } from '../../../../src/server/audit';
import { requirePermission } from '../../../../src/server/guard';
import { idParam } from '../../../../src/server/http';
import { getPersonOr404 } from '../../../../src/server/people';
import { activePositionOr400, assertNoTenure, tenureInsert, termOr400 } from '../../../../src/server/tenures';
import { id, isoDate } from '../../../../src/server/validation';

/** Give a person a position for a term (the current term by default). */
export const POST = defineHandler.withValidator({
  body: v.object({ positionId: id, termId: v.optional(id), startedOn: v.optional(isoDate) }),
})(async (c, { body }) => {
  const person = await getPersonOr404(idParam(c));
  const position = await activePositionOr400(body.positionId);
  const actor = await requirePermission(c, 'people.edit', position.departmentId ?? person.departmentId);
  const term = await termOr400(body.termId);
  await assertNoTenure(person.id, position.id, term.id);

  const tenureId = crypto.randomUUID();
  await tenureInsert({
    id: tenureId,
    personId: person.id,
    positionId: position.id,
    termId: term.id,
    startedOn: body.startedOn ?? new Date().toISOString().slice(0, 10),
  });
  await audit(actor.person.id, 'tenure.add', 'person', person.id, { positionId: position.id, termId: term.id });
  return c.json({ id: tenureId }, 201);
});
