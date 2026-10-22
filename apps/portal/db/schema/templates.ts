import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'void/schema-d1';
import { people } from './people';
import type { Definition } from '../../src/server/templates/validation';

export const emailTemplates = sqliteTable('email_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ownerScope: text('owner_scope', { enum: ['global', 'department', 'mailbox'] }).notNull(),
  ownerId: text('owner_id'),
  status: text('status', { enum: ['draft', 'published', 'retired'] }).notNull().default('draft'),
  currentVersion: integer('current_version').notNull().default(1),
  publishedVersionId: text('published_version_id'),
  createdBy: text('created_by').notNull().references(() => people.id),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (t) => [
  index('email_templates_scope').on(t.ownerScope, t.ownerId, t.id),
  check('email_template_scope_valid', sql`(${t.ownerScope}='global' AND ${t.ownerId} IS NULL) OR (${t.ownerScope} IN ('department','mailbox') AND ${t.ownerId} IS NOT NULL)`),
]);
export const emailTemplateVersions = sqliteTable('email_template_versions', {
  id: text('id').primaryKey(),
  templateId: text('template_id').notNull().references(() => emailTemplates.id),
  version: integer('version').notNull(),
  definition: text('definition', { mode: 'json' }).$type<Definition>().notNull(),
  createdBy: text('created_by').notNull().references(() => people.id),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (t) => [uniqueIndex('email_template_version_number').on(t.templateId, t.version)]);
