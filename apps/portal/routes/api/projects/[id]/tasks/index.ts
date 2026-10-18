import { projectTasks } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db } from 'void/db';
import { audit } from '../../../../../src/server/audit';
import { requirePrincipal } from '../../../../../src/server/guard';
import { badRequest, idParam } from '../../../../../src/server/http';
import { canSeeProject, projectFor, requireRight, taskFields } from '../../../../../src/server/projects';
import { rateLimit } from '../../../../../src/server/rate-limit';
import { notifyTaskAssigned } from '../../../../../src/server/notifications';

/** Add a task. The assignee, if any, must be able to see the project. */
export const POST = defineHandler.withValidator({ body: v.object(taskFields) })(async (c, { body }) => {
  const actor = await requirePrincipal(c);
  const loaded = await projectFor(actor, idParam(c));
  requireRight(loaded, 'manageTasks');
  await rateLimit(c, 'tasks_write', 300, 3600);
  const assigneeId = body.assigneeId || null;
  if (assigneeId && !(await canSeeProject(assigneeId, loaded))) badRequest('assignee_cannot_see_project');
  const task = {
    id: crypto.randomUUID(),
    projectId: loaded.project.id,
    title: body.title,
    description: body.description || null,
    assigneeId,
    dueDate: body.dueDate ?? null,
    priority: body.priority ?? 'normal',
  };
  await db.batch([
    db.insert(projectTasks).values({ ...task, createdBy: actor.person.id }),
    ...(assigneeId ? [notifyTaskAssigned({ taskId: task.id, version: 1, assigneeId, actorId: actor.person.id })] : []),
  ]);
  await audit(actor.person.id, 'task.create', 'task', task.id, {
    projectId: task.projectId,
    to: { title: task.title, assigneeId, dueDate: task.dueDate, priority: task.priority, status: 'pending' },
  });
  return c.json({ id: task.id }, 201);
});
