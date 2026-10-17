import { sql } from 'drizzle-orm';
import { index, primaryKey, sqliteTable, text } from 'void/schema-d1';
import { departments } from './org';

export const MEET_KINDS = ['club', 'department', 'inter_department'] as const;
export type MeetKind = (typeof MEET_KINDS)[number];

/**
 * Club-wide, department and inter-department meetings. The departments a
 * department meet (exactly one) or inter-department meet (one or more) is for
 * live in meet_departments. Every read hides the link a day after scheduled_at.
 */
export const meets = sqliteTable(
  'meets',
  {
    id: text('id').primaryKey(),
    kind: text('kind', { enum: MEET_KINDS }).notNull(),
    title: text('title').notNull(),
    description: text('description'),
    meetLink: text('meet_link'),
    /** ISO 8601 UTC instant. */
    scheduledAt: text('scheduled_at').notNull(),
    createdBy: text('created_by'),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [index('meets_kind_scheduled').on(t.kind, t.scheduledAt)],
);

export const meetDepartments = sqliteTable(
  'meet_departments',
  {
    meetId: text('meet_id')
      .notNull()
      .references(() => meets.id, { onDelete: 'cascade' }),
    departmentId: text('department_id')
      .notNull()
      .references(() => departments.id),
  },
  (t) => [primaryKey({ columns: [t.meetId, t.departmentId] }), index('meet_departments_department').on(t.departmentId)],
);
