import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'void/schema-d1';
import { departments } from './org';
import { people } from './people';

export const knowledgeArticles = sqliteTable('knowledge_articles', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  body: text('body').notNull(),
  scope: text('scope', { enum: ['global', 'department'] }).notNull(),
  departmentId: text('department_id').references(() => departments.id),
  status: text('status', { enum: ['draft', 'published', 'archived'] }).notNull().default('draft'),
  ownerId: text('owner_id').notNull().references(() => people.id),
  tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  projectId: text('project_id'),
  taskId: text('task_id'),
  meetId: text('meet_id'),
  revision: integer('revision').notNull().default(1),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (t) => [index('knowledge_scope_status').on(t.departmentId, t.status)]);

export const knowledgeRevisions = sqliteTable('knowledge_revisions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  articleId: text('article_id').notNull().references(() => knowledgeArticles.id, { onDelete: 'cascade' }),
  number: integer('number').notNull(),
  snapshot: text('snapshot', { mode: 'json' }).$type<{
    title: string; body: string; status: 'draft' | 'published' | 'archived'; tags: string[];
    projectId: string | null; taskId: string | null; meetId: string | null;
  }>().notNull(),
  editedBy: text('edited_by').notNull().references(() => people.id),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (t) => [uniqueIndex('knowledge_revision_number').on(t.articleId, t.number)]);
