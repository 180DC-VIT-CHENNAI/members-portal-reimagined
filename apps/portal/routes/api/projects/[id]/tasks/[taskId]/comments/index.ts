import { auditLog, taskComments } from '@schema';
import { defineHandler } from 'void';
import { and, db, eq, sql } from 'void/db';
import { routeParam } from '../../../../../../../src/server/departments';
import { requirePrincipal } from '../../../../../../../src/server/guard';
import { conflict, idParam } from '../../../../../../../src/server/http';
import { projectFor, taskOr404 } from '../../../../../../../src/server/projects';
import { rateLimit } from '../../../../../../../src/server/rate-limit';
import { commentInput, pageQuery, taskCommentsPage } from '../../../../../../../src/server/task-activity';
import { notifyTaskComment } from '../../../../../../../src/server/notifications';

/** A task's comments for anyone who can see the project, newest first. */
export const GET = defineHandler.withValidator({ query: pageQuery })(async (c, { query }) => {
  const principal = await requirePrincipal(c);
  const loaded = await projectFor(principal, idParam(c));
  const task = await taskOr404(loaded.project.id, routeParam(c, 'taskId'));
  await rateLimit(c, 'task_comments_read', 120, 60);
  c.header('Cache-Control', 'private, no-store');
  return taskCommentsPage(principal, loaded, task.id, query.before);
});

/**
 * Comment on a task. Sending the same requestId again returns the first
 * comment rather than a copy; reusing it for different text is a 409.
 */
export const POST = defineHandler.withValidator({ body: commentInput })(async (c, { body }) => {
  const actor = await requirePrincipal(c);
  const loaded = await projectFor(actor, idParam(c));
  const task = await taskOr404(loaded.project.id, routeParam(c, 'taskId'));
  await rateLimit(c, 'task_comments_write', 30, 60);
  const [inserted] = await db.batch([
    db.insert(taskComments)
      .values({ taskId: task.id, authorId: actor.person.id, requestId: body.requestId, body: body.body })
      .onConflictDoNothing()
      .returning({ id: taskComments.id }),
    // In the same transaction, audit only an insert that actually changed a row.
    db.insert(auditLog).select(db.select({
      id: sql`NULL`.as('id'),
      actorPersonId: sql<string>`${actor.person.id}`.as('actor_person_id'),
      action: sql<string>`'task.comment'`.as('action'),
      targetType: sql<string>`'task'`.as('target_type'),
      targetId: sql<string>`${task.id}`.as('target_id'),
      details: sql`json_object('projectId', ${loaded.project.id}, 'commentId', ${taskComments.id})`.as('details'),
      createdAt: sql<string>`datetime('now')`.as('created_at'),
    }).from(taskComments).where(and(
      eq(taskComments.authorId, actor.person.id), eq(taskComments.requestId, body.requestId), sql`changes() = 1`,
    ))),
    notifyTaskComment({ authorId: actor.person.id, requestId: body.requestId }),
  ]);
  const added = inserted[0];
  c.header('Cache-Control', 'private, no-store');
  if (!added) {
    const [earlier] = await db
      .select()
      .from(taskComments)
      .where(and(eq(taskComments.authorId, actor.person.id), eq(taskComments.requestId, body.requestId)));
    if (!earlier || earlier.taskId !== task.id || earlier.body !== body.body || earlier.deletedAt) conflict('request_reused');
    return c.json({ id: earlier.id, replayed: true }, 201);
  }
  return c.json({ id: added.id, replayed: false }, 201);
});
