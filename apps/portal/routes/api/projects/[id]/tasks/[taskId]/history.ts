import { defineHandler } from 'void';
import { routeParam } from '../../../../../../src/server/departments';
import { requirePrincipal } from '../../../../../../src/server/guard';
import { idParam } from '../../../../../../src/server/http';
import { projectFor, taskOr404 } from '../../../../../../src/server/projects';
import { rateLimit } from '../../../../../../src/server/rate-limit';
import { pageQuery, taskHistoryPage } from '../../../../../../src/server/task-activity';

/** A task's history for anyone who can see the project, newest first. */
export const GET = defineHandler.withValidator({ query: pageQuery })(async (c, { query }) => {
  const principal = await requirePrincipal(c);
  const loaded = await projectFor(principal, idParam(c));
  const task = await taskOr404(loaded.project.id, routeParam(c, 'taskId'));
  await rateLimit(c, 'task_history_read', 120, 60);
  c.header('Cache-Control', 'private, no-store');
  return taskHistoryPage(loaded.project.id, task.id, query.before);
});
