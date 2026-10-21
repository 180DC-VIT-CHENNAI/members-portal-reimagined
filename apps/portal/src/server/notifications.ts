import { notifications, people, projectDepartments, projectMembers, projects, projectTasks } from '@schema';
import type { SQL } from 'drizzle-orm';
import * as v from 'valibot';
import { and, asc, db, desc, eq, gt, inArray, isNotNull, isNull, lt, lte, ne, sql } from 'void/db';
import { COUNT_LIMIT, departmentsByProject, PAGE_SIZE, reminderDates } from './notifications-rules';
import { ACTIVE_STATUSES, loadActivePrincipals, type Principal } from './principal';
import { projectAccess } from './project-rules';
import { visibleProjects } from './project-visibility';
import { unreadMentionRows } from './messaging/notices';

const ACTIVE = sql.raw(ACTIVE_STATUSES.map((status) => `'${status}'`).join(', '));
/** Recipient filter for task notices: the person has not turned off in-app task notices. */
const wantsTaskNotices = (personId: SQL) =>
  sql`not exists (select 1 from notification_preferences np where np.person_id = ${personId} and np.category = 'tasks' and np.in_app = 0)`;

/**
 * Batch item placed IMMEDIATELY after the task insert or version-guarded
 * update in the same `db.batch`: tell the assignee, unless they assigned
 * themselves. `changes() = 1` refers to that preceding statement, so nothing
 * is written when the update lost a race; the `assigned:<task>:<version>` key
 * makes a replay a no-op.
 */
export function notifyTaskAssigned(input: { taskId: string; version: number; assigneeId: string; actorId: string }) {
  return db.insert(notifications).select(sql`
    SELECT NULL, t.assignee_id, 'task_assigned', t.project_id, t.id, NULL, ${input.actorId}, t.due_date,
      'assigned:' || t.id || ':' || t.version, datetime('now'), NULL
    FROM project_tasks t
    JOIN people p ON p.id = t.assignee_id AND p.status IN (${ACTIVE})
    WHERE changes() = 1 AND t.id = ${input.taskId} AND t.version = ${input.version} AND t.assignee_id = ${input.assigneeId}
      AND t.assignee_id <> ${input.actorId} AND ${wantsTaskNotices(sql`t.assignee_id`)}
    `).onConflictDoNothing({ target: [notifications.recipientId, notifications.dedupeKey] });
}

/**
 * Batch item placed IMMEDIATELY after the conditional `task.comment` audit
 * insert in the comment batch: tell the task's assignee, its creator and
 * earlier commenters, but not the author. `changes() = 1` holds only when that
 * audit row (and so the comment) was just inserted, so a replay or a reused
 * requestId adds nothing; the `comment:<id>` key backs that up.
 */
export function notifyTaskComment(input: { authorId: string; requestId: string }) {
  return db.insert(notifications).select(sql`
    SELECT DISTINCT NULL, p.id, 'task_comment', t.project_id, t.id, c.id, c.author_id, NULL,
      'comment:' || c.id, datetime('now'), NULL
    FROM task_comments c
    JOIN project_tasks t ON t.id = c.task_id
    JOIN people p ON p.status IN (${ACTIVE}) AND p.id <> c.author_id AND (
      p.id IN (t.assignee_id, t.created_by)
      OR p.id IN (SELECT o.author_id FROM task_comments o WHERE o.task_id = c.task_id AND o.id < c.id AND o.deleted_at IS NULL)
    )
    WHERE changes() = 1 AND c.author_id = ${input.authorId} AND c.request_id = ${input.requestId} AND c.deleted_at IS NULL
      AND ${wantsTaskNotices(sql`p.id`)}
    `).onConflictDoNothing({ target: [notifications.recipientId, notifications.dedupeKey] });
}

const mine = (principal: Principal, ...extra: (SQL | undefined)[]) =>
  and(eq(notifications.recipientId, principal.person.id), visibleProjects(principal) ?? sql`1`, ...extra);

export const inboxQuery = v.object({
  before: v.optional(v.pipe(v.string(), v.regex(/^[1-9]\d{0,14}$/, 'invalid_cursor'), v.transform(Number))),
  unread: v.optional(v.picklist(['1'])),
});

/**
 * The caller's notices, newest first, 30 at a time. Only notices whose task
 * still exists on a project the caller can see now are returned or counted.
 */
export async function inbox(principal: Principal, query: v.InferOutput<typeof inboxQuery>) {
  const rows = await db
    .select({
      id: notifications.id,
      kind: notifications.kind,
      projectId: projects.id,
      projectName: projects.name,
      taskId: projectTasks.id,
      taskTitle: projectTasks.title,
      taskStatus: projectTasks.status,
      commentId: notifications.commentId,
      dueDate: notifications.dueDate,
      actorName: people.fullName,
      createdAt: notifications.createdAt,
      readAt: notifications.readAt,
    })
    .from(notifications)
    .innerJoin(projectTasks, eq(projectTasks.id, notifications.taskId))
    .innerJoin(projects, eq(projects.id, projectTasks.projectId))
    .leftJoin(people, eq(people.id, notifications.actorId))
    .where(mine(principal, query.unread ? isNull(notifications.readAt) : undefined, query.before ? lt(notifications.id, query.before) : undefined))
    .orderBy(desc(notifications.id))
    .limit(PAGE_SIZE + 1);
  const page = rows.slice(0, PAGE_SIZE);
  return { notifications: page, nextBefore: rows.length > PAGE_SIZE ? (page.at(-1)?.id ?? null) : null };
}

/** Unread task and mention notices the caller can see, counting at most 99 (`capped` means "99+"). */
export async function unreadCount(principal: Principal) {
  const mentions = await unreadMentionRows(principal, COUNT_LIMIT + 1);
  const rows = await db
    .select({ id: notifications.id })
    .from(notifications)
    .innerJoin(projectTasks, eq(projectTasks.id, notifications.taskId))
    .innerJoin(projects, eq(projects.id, projectTasks.projectId))
    .where(mine(principal, isNull(notifications.readAt)))
    .limit(COUNT_LIMIT + 1);
  const total = rows.length + mentions;
  return { unread: Math.min(total, COUNT_LIMIT), capped: total > COUNT_LIMIT };
}

const notificationId = v.pipe(v.number(), v.integer(), v.minValue(1));

/** Either specific notices, or everything up to and including the newest one the reader has seen. */
export const markReadInput = v.union([
  v.object({ ids: v.pipe(v.array(notificationId), v.minLength(1), v.maxLength(50)) }),
  v.object({ upTo: notificationId }),
]);

/** Mark the caller's own notices read; ids belonging to anyone else match nothing. */
export async function markRead(principal: Principal, input: v.InferOutput<typeof markReadInput>) {
  await db
    .update(notifications)
    .set({ readAt: sql`datetime('now')` })
    .where(
      and(
        eq(notifications.recipientId, principal.person.id),
        isNull(notifications.readAt),
        'ids' in input ? inArray(notifications.id, input.ids) : lte(notifications.id, input.upTo),
      ),
    );
}

/** Tasks per scan page; their project ids stay under D1's 100 bound parameters. */
const SCAN_PAGE = 90;
/** Six bound values per row; D1 allows 100 per statement. */
const ROWS_PER_INSERT = 16;
const RETENTION = sql`datetime('now', '-180 days')`;

/**
 * Remind assignees of open or blocked tasks due today or tomorrow (UTC) on
 * active projects they can still see. Idempotent per recipient, task and due
 * date (`due:<task>:<date>`): tasks already reminded are skipped before
 * paging, and the scan pages by task id until done, so nothing is starved.
 * Also drops notices older than 180 days. Returns how many reminders it wrote.
 */
export async function queueDueReminders(now: Date): Promise<number> {
  const [today, tomorrow] = reminderDates(now);
  const principals = new Map((await loadActivePrincipals()).map((principal) => [principal.person.id, principal]));
  let written = 0;
  let after = '';
  for (;;) {
    const tasks = await db
      .select({
        id: projectTasks.id,
        projectId: projects.id,
        internal: projects.internal,
        assigneeId: people.id,
        dueDate: projectTasks.dueDate,
        member: sql<number>`exists (select 1 from ${projectMembers} where ${projectMembers.projectId} = ${projects.id} and ${projectMembers.personId} = ${people.id})`,
      })
      .from(projectTasks)
      .innerJoin(projects, eq(projects.id, projectTasks.projectId))
      .innerJoin(people, eq(people.id, projectTasks.assigneeId))
      .where(
        and(
          gt(projectTasks.id, after),
          inArray(projectTasks.dueDate, [today, tomorrow]),
          ne(projectTasks.status, 'completed'),
          isNotNull(projectTasks.assigneeId),
          eq(projects.status, 'active'),
          inArray(people.status, [...ACTIVE_STATUSES]),
          wantsTaskNotices(sql`${people.id}`),
          sql`not exists (select 1 from ${notifications} where ${notifications.recipientId} = ${people.id}
            and ${notifications.dedupeKey} = 'due:' || ${projectTasks.id} || ':' || ${projectTasks.dueDate})`,
        ),
      )
      .orderBy(asc(projectTasks.id))
      .limit(SCAN_PAGE);
    if (!tasks.length) break;
    after = tasks[tasks.length - 1].id;
    const links = await db
      .select({ projectId: projectDepartments.projectId, departmentId: projectDepartments.departmentId })
      .from(projectDepartments)
      .where(inArray(projectDepartments.projectId, [...new Set(tasks.map((task) => task.projectId))]));
    const departmentsOf = departmentsByProject(links);
    const reminders = tasks.flatMap((task) => {
      const assignee = principals.get(task.assigneeId);
      if (!assignee || !task.dueDate) return [];
      if (!projectAccess(assignee.permissions, departmentsOf.get(task.projectId) ?? [], Boolean(task.member), task.internal).view) return [];
      return [{
        recipientId: task.assigneeId,
        kind: 'task_due' as const,
        projectId: task.projectId,
        taskId: task.id,
        dueDate: task.dueDate,
        dedupeKey: `due:${task.id}:${task.dueDate}`,
      }];
    });
    for (let i = 0; i < reminders.length; i += ROWS_PER_INSERT) {
      await db
        .insert(notifications)
        .values(reminders.slice(i, i + ROWS_PER_INSERT))
        .onConflictDoNothing({ target: [notifications.recipientId, notifications.dedupeKey] });
    }
    written += reminders.length;
    if (tasks.length < SCAN_PAGE) break;
  }
  await db.delete(notifications).where(lt(notifications.createdAt, RETENTION));
  return written;
}
