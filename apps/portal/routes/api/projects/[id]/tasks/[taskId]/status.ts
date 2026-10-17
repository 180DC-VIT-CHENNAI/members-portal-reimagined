import { projectTasks, TASK_STATUSES } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { and, db, eq } from 'void/db';
import { audit } from '../../../../../../src/server/audit';
import { routeParam } from '../../../../../../src/server/departments';
import { requirePrincipal } from '../../../../../../src/server/guard';
import { conflict, forbidden, idParam } from '../../../../../../src/server/http';
import { projectFor, taskOr404 } from '../../../../../../src/server/projects';
import { rateLimit } from '../../../../../../src/server/rate-limit';

/**
 * Mark a task done or open again: its assignee, or anyone who manages the
 * project's tasks. A change made since the task was read is a 409.
 */
export const PUT = defineHandler.withValidator({ body: v.object({ status: v.picklist(TASK_STATUSES) }) })(async (c, { body }) => {
  const actor = await requirePrincipal(c);
  const loaded = await projectFor(actor, idParam(c));
  const task = await taskOr404(loaded.project.id, routeParam(c, 'taskId'));
  if (!loaded.access.manageTasks && task.assigneeId !== actor.person.id) forbidden();
  if (task.status === body.status) return { version: task.version, changed: false };
  await rateLimit(c, 'tasks_write', 300, 3600);
  const now = new Date().toISOString();
  const [updated] = await db
    .update(projectTasks)
    .set({ status: body.status, completedAt: body.status === 'completed' ? now : null, version: task.version + 1, updatedAt: now })
    .where(and(eq(projectTasks.id, task.id), eq(projectTasks.version, task.version)))
    .returning({ version: projectTasks.version });
  if (!updated) conflict('task_changed');
  await audit(actor.person.id, 'task.status', 'task', task.id, { projectId: loaded.project.id, from: task.status, to: body.status });
  return { version: updated.version, changed: true };
});
