import { projectTasks } from '@schema';
import { defineHandler } from 'void';
import { and, db, eq, sql } from 'void/db';
import { auditMany } from '../../../../src/server/audit';
import { requirePrincipal } from '../../../../src/server/guard';
import { idParam } from '../../../../src/server/http';
import { projectFor, requireRight } from '../../../../src/server/projects';
import { rateLimit } from '../../../../src/server/rate-limit';

/** Mark every open task on the project done; tasks already done keep their completion time. */
export const POST = defineHandler(async (c) => {
  const actor = await requirePrincipal(c);
  const loaded = await projectFor(actor, idParam(c));
  requireRight(loaded, 'manageTasks');
  await rateLimit(c, 'tasks_write', 300, 3600);
  const now = new Date().toISOString();
  const done = await db
    .update(projectTasks)
    .set({ status: 'completed', completedAt: now, updatedAt: now, version: sql`${projectTasks.version} + 1` })
    .where(and(eq(projectTasks.projectId, loaded.project.id), eq(projectTasks.status, 'pending')))
    .returning({ id: projectTasks.id });
  await auditMany(
    done.map((task) => ({
      actorPersonId: actor.person.id,
      action: 'task.status',
      targetType: 'task',
      targetId: task.id,
      details: { projectId: loaded.project.id, from: 'pending', to: 'completed', bulk: true },
    })),
  );
  return { completed: done.length };
});
