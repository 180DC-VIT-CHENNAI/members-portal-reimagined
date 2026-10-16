import { people } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db, eq } from 'void/db';
import { PERSON_STATUSES } from '../../../../db/schema/people';
import { audit } from '../../../../src/server/audit';
import { requirePermission } from '../../../../src/server/guard';
import { badRequest, idParam } from '../../../../src/server/http';
import { hasAccess, nextStatus } from '../../../../src/server/lifecycle';
import { getPersonOr404 } from '../../../../src/server/people';
import { revokeSessions } from '../../../../src/server/signin';

/**
 * Move a person through the lifecycle. Losing access (alumni, removed) ends
 * their sessions immediately; the record is kept.
 */
export const POST = defineHandler.withValidator({
  body: v.object({ status: v.picklist(PERSON_STATUSES), note: v.optional(v.pipe(v.string(), v.maxLength(500))) }),
})(async (c, { body }) => {
  const person = await getPersonOr404(idParam(c));
  const actor = await requirePermission(c, 'people.lifecycle', person.departmentId);
  if (actor.person.id === person.id) badRequest('cannot_change_own_status');

  const result = nextStatus(person.status, body.status, person.authUserId !== null);
  if (!result.ok) badRequest(result.reason);

  await db
    .update(people)
    .set({ status: result.status, statusChangedAt: sqlNow(), updatedAt: sqlNow() })
    .where(eq(people.id, person.id));
  if (!hasAccess(result.status)) await revokeSessions(c.env.DB, person.authUserId);
  await audit(actor.person.id, 'person.status', 'person', person.id, {
    from: person.status,
    to: result.status,
    note: body.note ?? null,
  });
  return { id: person.id, status: result.status };
});

function sqlNow(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}
