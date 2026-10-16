import { sql } from 'drizzle-orm';
import { index, sqliteTable, text } from 'void/schema-d1';
import { departments } from './org';

// Department workspace (slice 4): each department's documents, instructions
// for its members, and its own lightweight project tracker. This tracker is
// separate from the club-wide projects with tasks.

export const INSTRUCTION_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export const DEPARTMENT_PROJECT_STATUSES = ['upcoming', 'active', 'completed', 'on_hold'] as const;

/** Links to documents a department keeps (the files themselves live elsewhere). */
export const departmentDocuments = sqliteTable(
  'department_documents',
  {
    id: text('id').primaryKey(),
    departmentId: text('department_id')
      .notNull()
      .references(() => departments.id),
    title: text('title').notNull(),
    description: text('description'),
    fileUrl: text('file_url'),
    status: text('status').notNull().default('pending'),
    createdBy: text('created_by'),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [index('department_documents_department').on(t.departmentId, t.createdAt)],
);

/** Standing instructions a department's leads give its members. */
export const departmentInstructions = sqliteTable(
  'department_instructions',
  {
    id: text('id').primaryKey(),
    departmentId: text('department_id')
      .notNull()
      .references(() => departments.id),
    title: text('title').notNull(),
    content: text('content').notNull(),
    priority: text('priority', { enum: INSTRUCTION_PRIORITIES }).notNull().default('medium'),
    createdBy: text('created_by'),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [index('department_instructions_department').on(t.departmentId, t.createdAt)],
);

export const departmentProjects = sqliteTable(
  'department_projects',
  {
    id: text('id').primaryKey(),
    departmentId: text('department_id')
      .notNull()
      .references(() => departments.id),
    name: text('name').notNull(),
    description: text('description'),
    status: text('status', { enum: DEPARTMENT_PROJECT_STATUSES }).notNull().default('upcoming'),
    deadline: text('deadline'),
    createdBy: text('created_by'),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [index('department_projects_department').on(t.departmentId, t.createdAt)],
);
