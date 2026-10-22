import { people } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db, eq } from 'void/db';
import { PERSON_STATUSES } from '../../../../db/schema/people';
import { audit } from '../../../../src/server/audit';
import { requirePermission, requirePrincipal } from '../../../../src/server/guard';
import { badRequest, forbidden, idParam } from '../../../../src/server/http';
import { hasAccess, nextStatus } from '../../../../src/server/lifecycle';
import { getPersonOr404 } from '../../../../src/server/people';
import { can } from '../../../../src/server/permissions';
import { revokeSessions } from '../../../../src/server/signin';
import { sqlNow, statusHistoryFor, statusHistoryInsert, todayIso } from '../../../../src/server/status-history';
import { calendarDate } from '../../../../src/server/validation';

/** The person's status history, oldest first: themselves, or people.lifecycle for their department. */
export const GET = defineHandler(async (c) => {
  const viewer = await requirePrincipal(c);
  const person = await getPersonOr404(idParam(c));
  if (viewer.person.id !== person.id && !can(viewer.permissions, 'people.lifecycle', person.departmentId)) forbidden();
  return statusHistoryFor(person.id);
});

const reasonText = v.pipe(v.string(), v.trim(), v.maxLength(500));

/**
 * Move a person through the lifecycle. Losing access (suspended, alumni, removed) ends
 * their sessions immediately; the record is kept. Every change is recorded in
 * the status history with its reason (`reason`, or the older `note`) and the
 * date it counts from (`effectiveOn`, today by default, never in the future).
 */
export const POST = defineHandler.withValidator({
  body: v.object({
    status: v.picklist(PERSON_STATUSES),
    note: v.optional(reasonText),
    reason: v.optional(reasonText),
    effectiveOn: v.optional(calendarDate),
  }),
})(async (c, { body }) => {
  const person = await getPersonOr404(idParam(c));
  const actor = await requirePermission(c, 'people.lifecycle', person.departmentId);
  if (actor.person.id === person.id) badRequest('cannot_change_own_status');

  const result = nextStatus(person.status, body.status, person.authUserId !== null);
  if (!result.ok) badRequest(result.reason);
  const effectiveOn = body.effectiveOn ?? todayIso();
  if (effectiveOn > todayIso()) badRequest('effective_date_in_future');
  const reason = body.reason || body.note || null;
  if (result.status === 'suspended' && !reason) badRequest('status_reason_required');

  await db.batch([
    db.update(people).set({ status: result.status, statusChangedAt: sqlNow(), updatedAt: sqlNow() }).where(eq(people.id, person.id)),
    statusHistoryInsert({ personId: person.id, from: person.status, to: result.status, reason, effectiveOn, actorPersonId: actor.person.id }),
  ]);
  if (!hasAccess(result.status)) await revokeSessions(c.env.DB, person.authUserId);
  await audit(actor.person.id, 'person.status', 'person', person.id, {
    from: person.status,
    to: result.status,
    note: reason,
    effectiveOn,
  });
  return { id: person.id, status: result.status };
});
