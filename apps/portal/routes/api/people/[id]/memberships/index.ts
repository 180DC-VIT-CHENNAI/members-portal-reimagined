import { departmentMemberships, departments } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { and, db, eq, isNull } from 'void/db';
import { audit } from '../../../../../src/server/audit';
import { requirePermission } from '../../../../../src/server/guard';
import { badRequest, conflict, idParam } from '../../../../../src/server/http';
import { getPersonOr404 } from '../../../../../src/server/people';
import { todayIso } from '../../../../../src/server/status-history';
import { calendarDate, id, optionalText } from '../../../../../src/server/validation';

/**
 * Add a secondary department membership. Needs people.edit for the secondary
 * department. It lists the person there; it grants no department permissions,
 * which keep following the primary department.
 */
export const POST = defineHandler.withValidator({
  body: v.object({ departmentId: id, note: optionalText(120), validFrom: v.optional(calendarDate), validUntil: v.optional(v.nullable(calendarDate)) }),
})(async (c, { body }) => {
  const person = await getPersonOr404(idParam(c));
  const actor = await requirePermission(c, 'people.edit', body.departmentId);
  const [department] = await db.select().from(departments).where(eq(departments.id, body.departmentId));
  if (!department || !department.active) badRequest('unknown_department');
  if (person.departmentId === body.departmentId) badRequest('already_primary_department');
  const validFrom = body.validFrom ?? todayIso();
  if (body.validUntil && body.validUntil < validFrom) badRequest('ends_before_start');
  const [open] = await db
    .select({ id: departmentMemberships.id })
    .from(departmentMemberships)
    .where(and(eq(departmentMemberships.personId, person.id), eq(departmentMemberships.departmentId, body.departmentId), isNull(departmentMemberships.validUntil)));
  if (open) conflict('membership_exists');

  const membershipId = crypto.randomUUID();
  await db.insert(departmentMemberships).values({
    id: membershipId,
    personId: person.id,
    departmentId: body.departmentId,
    note: body.note ?? null,
    validFrom,
    validUntil: body.validUntil ?? null,
    createdBy: actor.person.id,
  });
  await audit(actor.person.id, 'membership.add', 'person', person.id, { membershipId, departmentId: body.departmentId });
  return c.json({ id: membershipId }, 201);
});
