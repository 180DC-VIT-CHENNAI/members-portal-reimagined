import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'void/schema-d1';
import { departments, terms } from './org';
import { people } from './people';

export const PROJECT_STATUSES = ['upcoming', 'active', 'completed', 'on_hold'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const TASK_STATUSES = ['pending', 'blocked', 'completed'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/** Client and internal projects. Only completed non-internal work is public. */
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
    /** A department's own internal project, which its department-project managers may run. */
    internal: integer('internal', { mode: 'boolean' }).notNull().default(false),
    /** The department_projects row this project was copied from, if any. */
    legacyDepartmentProjectId: text('legacy_department_project_id'),
    completedAt: text('completed_at'),
    createdBy: text('created_by'),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [
    index('projects_status').on(t.status, t.completedAt),
    uniqueIndex('projects_legacy_department_project').on(t.legacyDepartmentProjectId),
  ],
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
    /** Why a blocked task is stuck; set only while it is blocked. */
    blockedReason: text('blocked_reason'),
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

/**
 * Plain-text comments on a task, by anyone who can see its project. Removing a
 * comment blanks it and keeps its place. `request_id` is chosen by the client so
 * a retried post is stored once.
 */
export const taskComments = sqliteTable(
  'task_comments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    taskId: text('task_id')
      .notNull()
      .references(() => projectTasks.id, { onDelete: 'cascade' }),
    authorId: text('author_id')
      .notNull()
      .references(() => people.id),
    requestId: text('request_id').notNull(),
    body: text('body').notNull(),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
    deletedAt: text('deleted_at'),
  },
  (t) => [uniqueIndex('task_comments_request').on(t.authorId, t.requestId), index('task_comments_task').on(t.taskId, t.id)],
);
