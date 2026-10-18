import { meetActionItems, meetDepartments, meets } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db, eq } from 'void/db';
import { audit } from '../../../src/server/audit';
import { requirePrincipal } from '../../../src/server/guard';
import { badRequest, idParam } from '../../../src/server/http';
import { followUpFields, meetOr404, requireMeetManage } from '../../../src/server/meets';
import { rateLimit } from '../../../src/server/rate-limit';

/**
 * Set a meet's agenda and notes (whoever may manage it). Only the fields sent
 * change; an empty value clears one. Nobody is emailed.
 */
export const PATCH = defineHandler.withValidator({ body: v.object(followUpFields) })(async (c, { body }) => {
  await requirePrincipal(c);
  const { meet, departmentIds } = await meetOr404(idParam(c));
  const actor = await requireMeetManage(c, meet.kind, departmentIds);
  const changes: Partial<typeof meets.$inferInsert> = {};
  if (body.agenda !== undefined) changes.agenda = body.agenda || null;
  if (body.notes !== undefined) changes.notes = body.notes || null;
  if (!Object.keys(changes).length) badRequest('nothing_to_change');
  await rateLimit(c, 'meets_write', 60, 3600);
  await db.update(meets).set(changes).where(eq(meets.id, meet.id));
  await audit(actor.person.id, 'meet.update', 'meet', meet.id, { fields: Object.keys(changes) });
  return { id: meet.id, agenda: changes.agenda === undefined ? meet.agenda : changes.agenda, notes: changes.notes === undefined ? meet.notes : changes.notes };
});

/** Remove a meet. Announcements already queued still go out. */
export const DELETE = defineHandler(async (c) => {
  await requirePrincipal(c);
  const { meet, departmentIds } = await meetOr404(idParam(c));
  const actor = await requireMeetManage(c, meet.kind, departmentIds);
  await rateLimit(c, 'meets_write', 60, 3600);
  await db.batch([
    db.delete(meetActionItems).where(eq(meetActionItems.meetId, meet.id)),
    db.delete(meetDepartments).where(eq(meetDepartments.meetId, meet.id)),
    db.delete(meets).where(eq(meets.id, meet.id)),
  ]);
  await audit(actor.person.id, 'meet.delete', 'meet', meet.id, { kind: meet.kind, title: meet.title });
  return { id: meet.id };
});
