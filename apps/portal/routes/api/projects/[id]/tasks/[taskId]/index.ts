import { projectTasks, taskComments } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { and, db, eq } from 'void/db';
import { audit } from '../../../../../../src/server/audit';
import { routeParam } from '../../../../../../src/server/departments';
import { assertProjectFilesDeletable } from '../../../../../../src/server/document-access';
import { requirePrincipal } from '../../../../../../src/server/guard';
import { badRequest, conflict, idParam } from '../../../../../../src/server/http';
import { canSeeProject, projectFor, requireRight, taskFields, taskOr404 } from '../../../../../../src/server/projects';
import { rateLimit } from '../../../../../../src/server/rate-limit';
import { notifyTaskAssigned } from '../../../../../../src/server/notifications';

const taskEdit = v.object({
  version: v.pipe(v.number(), v.integer(), v.minValue(1)),
  title: v.optional(taskFields.title),
  description: taskFields.description,
  assigneeId: taskFields.assigneeId,
  dueDate: taskFields.dueDate,
  priority: taskFields.priority,
});

/** Edit a task. `version` must be the task's current version, otherwise 409 and nothing changes. */
export const PATCH = defineHandler.withValidator({ body: taskEdit })(async (c, { body }) => {
  const actor = await requirePrincipal(c);
  const loaded = await projectFor(actor, idParam(c));
  requireRight(loaded, 'manageTasks');
  const task = await taskOr404(loaded.project.id, routeParam(c, 'taskId'));
  const next = {
    title: body.title ?? task.title,
    description: body.description === undefined ? task.description : body.description || null,
    assigneeId: body.assigneeId === undefined ? task.assigneeId : body.assigneeId || null,
    dueDate: body.dueDate === undefined ? task.dueDate : body.dueDate,
    priority: body.priority ?? task.priority,
  };
  const changed = (Object.keys(next) as (keyof typeof next)[]).filter((key) => next[key] !== task[key]);
  if (!changed.length) return { version: task.version, changed: false };
  if (body.version !== task.version) conflict('task_changed');
  await rateLimit(c, 'tasks_write', 300, 3600);
  if (changed.includes('assigneeId') && next.assigneeId && !(await canSeeProject(next.assigneeId, loaded))) {
    badRequest('assignee_cannot_see_project');
  }
  const [updates] = await db.batch([db
    .update(projectTasks)
    .set({ ...next, version: task.version + 1, updatedAt: new Date().toISOString() })
    .where(and(eq(projectTasks.id, task.id), eq(projectTasks.version, task.version)))
    .returning({ version: projectTasks.version }),
    ...(changed.includes('assigneeId') && next.assigneeId
      ? [notifyTaskAssigned({ taskId: task.id, version: task.version + 1, assigneeId: next.assigneeId, actorId: actor.person.id })]
      : []),
  ]);
  const [updated] = updates;
  if (!updated) conflict('task_changed');
  const pick = (source: typeof next) => Object.fromEntries(changed.map((key) => [key, source[key]]));
  await audit(actor.person.id, 'task.update', 'task', task.id, { projectId: loaded.project.id, from: pick(task), to: pick(next) });
  return { version: updated.version, changed: true };
});

/** Remove a task and its comments. */
export const DELETE = defineHandler(async (c) => {
  const actor = await requirePrincipal(c);
  const loaded = await projectFor(actor, idParam(c));
  requireRight(loaded, 'manageTasks');
  const task = await taskOr404(loaded.project.id, routeParam(c, 'taskId'));
  await assertProjectFilesDeletable(loaded.project.id, task.id);
  await db.batch([db.delete(taskComments).where(eq(taskComments.taskId, task.id)), db.delete(projectTasks).where(eq(projectTasks.id, task.id))]);
  await audit(actor.person.id, 'task.delete', 'task', task.id, { projectId: loaded.project.id, title: task.title });
  return { id: task.id };
});
