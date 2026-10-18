import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'void/schema-d1';
import { people } from './people';
import { projects, projectTasks } from './projects';

/**
 * Private attachments on a project (task_id null) or on one of its tasks. The
 * bytes live in CLUB_FILES at `key` (`project-files/<projectId>/<id>.<ext>`),
 * a prefix the shared club-file library never lists. Rows go with their
 * project or task; the object is then unreachable because every download
 * resolves the key through this table.
 */
export const projectFiles = sqliteTable(
  'project_files',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    taskId: text('task_id').references(() => projectTasks.id, { onDelete: 'cascade' }),
    key: text('key').notNull().unique(),
    fileName: text('file_name').notNull(),
    contentType: text('content_type').notNull(),
    bytes: integer('bytes').notNull(),
    uploadedBy: text('uploaded_by').references(() => people.id, { onDelete: 'set null' }),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [index('project_files_scope').on(t.projectId, t.taskId, t.createdAt)],
);

/** Deletion outbox populated by the metadata-delete trigger, including cascades. */
export const projectFileDeletions = sqliteTable('project_file_deletions', {
  key: text('key').primaryKey(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});
