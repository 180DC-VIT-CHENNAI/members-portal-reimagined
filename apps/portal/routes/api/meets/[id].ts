import { meetDepartments, meets } from '@schema';
import { defineHandler } from 'void';
import { db, eq } from 'void/db';
import { audit } from '../../../src/server/audit';
import { requirePrincipal } from '../../../src/server/guard';
import { idParam } from '../../../src/server/http';
import { meetOr404, requireMeetManage } from '../../../src/server/meets';
import { rateLimit } from '../../../src/server/rate-limit';

/** Remove a meet. Announcements already queued still go out. */
export const DELETE = defineHandler(async (c) => {
  await requirePrincipal(c);
  const { meet, departmentIds } = await meetOr404(idParam(c));
  const actor = await requireMeetManage(c, meet.kind, departmentIds);
  await rateLimit(c, 'meets_write', 60, 3600);
  await db.batch([
    db.delete(meetDepartments).where(eq(meetDepartments.meetId, meet.id)),
    db.delete(meets).where(eq(meets.id, meet.id)),
  ]);
  await audit(actor.person.id, 'meet.delete', 'meet', meet.id, { kind: meet.kind, title: meet.title });
  return { id: meet.id };
});
