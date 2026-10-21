import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'void/schema-d1';
import { people } from './people';
import { projectTasks } from './projects';

export const TASK_NOTIFICATION_KINDS = ['task_assigned', 'task_comment', 'task_due'] as const;
export const NOTIFICATION_KINDS = [...TASK_NOTIFICATION_KINDS, 'message_mention'] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/**
 * In-app notices about project tasks. `dedupe_key` is unique per recipient, so
 * a retried mutation or a re-run reminder job writes each notice once:
 * `assigned:<task>:<version>`, `comment:<comment id>`, `due:<task>:<due date>`.
 * Rows go with their task. Project access is checked again on every read, so a
 * stored notice never shows a project the reader can no longer see.
 */
export const notifications = sqliteTable(
  'notifications',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    recipientId: text('recipient_id')
      .notNull()
      .references(() => people.id),
    kind: text('kind', { enum: TASK_NOTIFICATION_KINDS }).notNull(),
    projectId: text('project_id').notNull(),
    taskId: text('task_id')
      .notNull()
      .references(() => projectTasks.id, { onDelete: 'cascade' }),
    /** The comment for `task_comment`; comments are only hard-deleted with their task. */
    commentId: integer('comment_id'),
    actorId: text('actor_id').references(() => people.id),
    /** YYYY-MM-DD; the due date a `task_due` notice was about. */
    dueDate: text('due_date'),
    dedupeKey: text('dedupe_key').notNull(),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
    readAt: text('read_at'),
  },
  (t) => [
    uniqueIndex('notifications_dedupe').on(t.recipientId, t.dedupeKey),
    index('notifications_inbox').on(t.recipientId, t.readAt, t.id),
    index('notifications_task').on(t.taskId),
  ],
);
