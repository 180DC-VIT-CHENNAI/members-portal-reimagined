import { meetActionItems } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db } from 'void/db';
import { audit } from '../../../../../src/server/audit';
import { requirePrincipal } from '../../../../../src/server/guard';
import { idParam } from '../../../../../src/server/http';
import { meetOr404, requireMeetManage } from '../../../../../src/server/meets';
import { projectFor, taskOr404 } from '../../../../../src/server/projects';
import { rateLimit } from '../../../../../src/server/rate-limit';
import { id } from '../../../../../src/server/validation';

/**
 * Link a project task to a meet as an action item. Needs the right to manage
 * the meet and to see the task's project; a hidden project or task is a 404.
 * Linking the same task again changes nothing.
 */
export const POST = defineHandler.withValidator({ body: v.object({ projectId: id, taskId: id }) })(async (c, { body }) => {
  await requirePrincipal(c);
  const { meet, departmentIds } = await meetOr404(idParam(c));
  const actor = await requireMeetManage(c, meet.kind, departmentIds);
  await rateLimit(c, 'meets_write', 60, 3600);
  const loaded = await projectFor(actor, body.projectId);
  const task = await taskOr404(loaded.project.id, body.taskId);
  const [added] = await db
    .insert(meetActionItems)
    .values({ meetId: meet.id, taskId: task.id, createdBy: actor.person.id })
    .onConflictDoNothing()
    .returning({ taskId: meetActionItems.taskId });
  if (added) await audit(actor.person.id, 'meet.action_item.link', 'meet', meet.id, { projectId: loaded.project.id, taskId: task.id });
  return c.json({ meetId: meet.id, taskId: task.id, linked: added !== undefined }, added ? 201 : 200);
});
