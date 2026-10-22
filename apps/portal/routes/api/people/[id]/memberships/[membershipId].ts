import { departmentMemberships } from '@schema';
import { defineHandler } from 'void';
import { and, db, eq } from 'void/db';
import { audit } from '../../../../../src/server/audit';
import { requirePermission } from '../../../../../src/server/guard';
import { badRequest, idParam, notFound } from '../../../../../src/server/http';
import { todayIso } from '../../../../../src/server/status-history';

/** End a secondary membership today (kept as history). Needs people.edit for that department. */
export const DELETE = defineHandler(async (c) => {
  const [membership] = await db
    .select()
    .from(departmentMemberships)
    .where(and(eq(departmentMemberships.id, c.req.param('membershipId') ?? ''), eq(departmentMemberships.personId, idParam(c))));
  if (!membership) notFound('membership_not_found');
  const actor = await requirePermission(c, 'people.edit', membership.departmentId);
  const today = todayIso();
  if (membership.validUntil && membership.validUntil < today) badRequest('membership_already_ended');
  const validUntil = membership.validFrom > today ? membership.validFrom : today;
  await db.update(departmentMemberships).set({ validUntil }).where(eq(departmentMemberships.id, membership.id));
  await audit(actor.person.id, 'membership.end', 'person', membership.personId, { membershipId: membership.id, validUntil });
  return { id: membership.id, validUntil };
});
