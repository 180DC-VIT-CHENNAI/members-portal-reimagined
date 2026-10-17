import { auditLog, taskComments } from '@schema';
import { defineHandler } from 'void';
import { and, db, eq, isNull, sql } from 'void/db';
import { routeParam } from '../../../../../../../src/server/departments';
import { requirePrincipal } from '../../../../../../../src/server/guard';
import { forbidden, idParam, notFound } from '../../../../../../../src/server/http';
import { projectFor, taskOr404 } from '../../../../../../../src/server/projects';
import { rateLimit } from '../../../../../../../src/server/rate-limit';

/** Remove a comment: its author, or anyone who manages the project's tasks. Its text is erased; removing it again is a no-op. */
export const DELETE = defineHandler(async (c) => {
  const actor = await requirePrincipal(c);
  const loaded = await projectFor(actor, idParam(c));
  const task = await taskOr404(loaded.project.id, routeParam(c, 'taskId'));
  const commentId = Number(routeParam(c, 'commentId'));
  const [comment] = Number.isSafeInteger(commentId)
    ? await db
        .select()
        .from(taskComments)
        .where(and(eq(taskComments.id, commentId), eq(taskComments.taskId, task.id)))
    : [];
  if (!comment) notFound('comment_not_found');
  if (comment.authorId !== actor.person.id && !loaded.access.manageTasks) forbidden();
  if (comment.deletedAt) return { id: comment.id };
  await rateLimit(c, 'task_comments_write', 30, 60);
  await db.batch([
    db.update(taskComments).set({ body: '', deletedAt: new Date().toISOString() })
      .where(and(eq(taskComments.id, comment.id), isNull(taskComments.deletedAt))),
    db.insert(auditLog).select(db.select({
      id: sql`NULL`.as('id'),
      actorPersonId: sql<string>`${actor.person.id}`.as('actor_person_id'),
      action: sql<string>`'task.comment.remove'`.as('action'),
      targetType: sql<string>`'task'`.as('target_type'),
      targetId: sql<string>`${task.id}`.as('target_id'),
      details: sql`json_object('projectId', ${loaded.project.id}, 'commentId', ${comment.id})`.as('details'),
      createdAt: sql<string>`datetime('now')`.as('created_at'),
    }).from(taskComments).where(and(eq(taskComments.id, comment.id), sql`changes() = 1`))),
  ]);
  return { id: comment.id };
});
