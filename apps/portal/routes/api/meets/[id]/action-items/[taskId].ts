import { meetActionItems } from '@schema';
import { defineHandler } from 'void';
import { and, db, eq } from 'void/db';
import { audit } from '../../../../../src/server/audit';
import { routeParam } from '../../../../../src/server/departments';
import { requirePrincipal } from '../../../../../src/server/guard';
import { idParam } from '../../../../../src/server/http';
import { actionItemProjectOr404, meetOr404, requireMeetManage } from '../../../../../src/server/meets';
import { projectFor } from '../../../../../src/server/projects';
import { rateLimit } from '../../../../../src/server/rate-limit';

/**
 * Unlink a task from a meet. Like linking, it needs the right to manage the
 * meet and to see the task's project; a link to a hidden project is a 404.
 * The task itself is untouched.
 */
export const DELETE = defineHandler(async (c) => {
  await requirePrincipal(c);
  const { meet, departmentIds } = await meetOr404(idParam(c));
  const actor = await requireMeetManage(c, meet.kind, departmentIds);
  const taskId = routeParam(c, 'taskId');
  const projectId = await actionItemProjectOr404(meet.id, taskId);
  await projectFor(actor, projectId);
  await rateLimit(c, 'meets_write', 60, 3600);
  await db.delete(meetActionItems).where(and(eq(meetActionItems.meetId, meet.id), eq(meetActionItems.taskId, taskId)));
  await audit(actor.person.id, 'meet.action_item.unlink', 'meet', meet.id, { projectId, taskId });
  return { meetId: meet.id, taskId };
});
