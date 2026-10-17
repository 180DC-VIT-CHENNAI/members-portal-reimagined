import { auditLog, people, taskComments } from '@schema';
import * as v from 'valibot';
import { and, db, desc, eq, inArray, lt, sql } from 'void/db';
import type { Principal } from './principal';
import type { LoadedProject } from './projects';
import { historyPersonIds, TASK_HISTORY_ACTIONS, taskHistoryEvent } from './task-history';

const PAGE_SIZE = 50;

/** `?before=<id>` pages backwards from the `nextBefore` of the previous page. */
export const pageQuery = v.object({
  before: v.optional(v.pipe(v.string(), v.regex(/^[1-9]\d{0,14}$/, 'invalid_cursor'), v.transform(Number))),
});

/** Plain text up to 4,000 characters; `requestId` makes a retried post idempotent. */
export const commentInput = v.object({
  requestId: v.pipe(v.string(), v.uuid()),
  body: v.pipe(v.string(), v.maxLength(4000), v.trim(), v.minLength(1)),
});

const nextBefore = <T extends { id: number }>(rows: readonly T[], page: readonly T[]) => (rows.length > page.length ? (page.at(-1)?.id ?? null) : null);

/** A task's comments, newest first, 50 at a time. Removed comments keep their place without their text. */
export async function taskCommentsPage(principal: Principal, loaded: LoadedProject, taskId: string, before: number | undefined) {
  const rows = await db
    .select({
      id: taskComments.id,
      authorId: taskComments.authorId,
      authorName: people.fullName,
      body: taskComments.body,
      createdAt: taskComments.createdAt,
      deletedAt: taskComments.deletedAt,
    })
    .from(taskComments)
    .innerJoin(people, eq(people.id, taskComments.authorId))
    .where(and(eq(taskComments.taskId, taskId), before ? lt(taskComments.id, before) : undefined))
    .orderBy(desc(taskComments.id))
    .limit(PAGE_SIZE + 1);
  const page = rows.slice(0, PAGE_SIZE);
  return {
    comments: page.map(({ authorId, body, deletedAt, ...comment }) => ({
      ...comment,
      body: deletedAt ? null : body,
      removed: deletedAt !== null,
      canRemove: deletedAt === null && (authorId === principal.person.id || loaded.access.manageTasks),
    })),
    nextBefore: nextBefore(rows, page),
  };
}

/** A task's history from the audit log, newest first, 50 at a time. */
export async function taskHistoryPage(projectId: string, taskId: string, before: number | undefined) {
  const rows = await db
    .select({ id: auditLog.id, action: auditLog.action, createdAt: auditLog.createdAt, details: auditLog.details, actorName: people.fullName })
    .from(auditLog)
    .leftJoin(people, eq(people.id, auditLog.actorPersonId))
    .where(
      and(
        eq(auditLog.targetType, 'task'),
        eq(auditLog.targetId, taskId),
        inArray(auditLog.action, [...TASK_HISTORY_ACTIONS]),
        sql`json_extract(${auditLog.details}, '$.projectId') = ${projectId}`,
        before ? lt(auditLog.id, before) : undefined,
      ),
    )
    .orderBy(desc(auditLog.id))
    .limit(PAGE_SIZE + 1);
  const page = rows.slice(0, PAGE_SIZE);
  // At most two people per entry, so 100 ids: D1's bound-parameter limit.
  const ids = historyPersonIds(page);
  const named = ids.length ? await db.select({ id: people.id, fullName: people.fullName }).from(people).where(inArray(people.id, ids)) : [];
  const names = new Map(named.map((person) => [person.id, person.fullName]));
  return { events: page.map((row) => taskHistoryEvent(row, names)), nextBefore: nextBefore(rows, page) };
}
