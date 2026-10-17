import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'void/schema-d1';
import { departments, terms } from './org';
import { people } from './people';

export const PROJECT_STATUSES = ['active', 'completed'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const TASK_STATUSES = ['pending', 'completed'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/**
 * Client projects with tasks (slice 5), separate from the lightweight
 * department_projects tracker. Completed projects are listed on the public
 * site with their name, client and description.
 */
export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    client: text('client'),
    description: text('description'),
    termId: text('term_id').references(() => terms.id, { onDelete: 'set null' }),
    /** YYYY-MM-DD. */
    deadline: text('deadline'),
    status: text('status', { enum: PROJECT_STATUSES }).notNull().default('active'),
    completedAt: text('completed_at'),
    createdBy: text('created_by'),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [index('projects_status').on(t.status, t.completedAt)],
);

/** The departments a project belongs to (one or more). */
export const projectDepartments = sqliteTable(
  'project_departments',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    departmentId: text('department_id')
      .notNull()
      .references(() => departments.id),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.departmentId] }), index('project_departments_department').on(t.departmentId)],
);

/**
 * People named on a project and their role on it. Membership lets someone see
 * the project from outside its departments; it never grants management.
 */
export const projectMembers = sqliteTable(
  'project_members',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    personId: text('person_id')
      .notNull()
      .references(() => people.id),
    role: text('role').notNull(),
    createdBy: text('created_by'),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [uniqueIndex('project_members_person').on(t.projectId, t.personId), index('project_members_by_person').on(t.personId)],
);

/** A project's tasks. `version` goes up on every change so stale edits can be refused. */
export const projectTasks = sqliteTable(
  'project_tasks',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    assigneeId: text('assignee_id').references(() => people.id),
    status: text('status', { enum: TASK_STATUSES }).notNull().default('pending'),
    /** YYYY-MM-DD. */
    dueDate: text('due_date'),
    priority: text('priority', { enum: TASK_PRIORITIES }).notNull().default('normal'),
    version: integer('version').notNull().default(1),
    completedAt: text('completed_at'),
    createdBy: text('created_by'),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [index('project_tasks_project').on(t.projectId, t.createdAt), index('project_tasks_assignee').on(t.assigneeId, t.status)],
);
