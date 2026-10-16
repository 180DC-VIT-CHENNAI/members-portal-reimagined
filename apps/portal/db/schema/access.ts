import { sql } from 'void/db';
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'void/schema-d1';

/**
 * Named bundles of permissions (e.g. "admin", "director", "member").
 * Permission keys are defined in code (src/server/permissions.ts) so they are
 * type-checked; this table only stores which role grants which key.
 */
export const accessRoles = sqliteTable('access_roles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  isSystem: integer('is_system', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

/**
 * scope "global" applies everywhere; scope "department" applies only within the
 * holder's own department(s).
 */
export const rolePermissions = sqliteTable(
  'role_permissions',
  {
    roleId: text('role_id')
      .notNull()
      .references(() => accessRoles.id, { onDelete: 'cascade' }),
    permission: text('permission').notNull(),
    scope: text('scope', { enum: ['global', 'department'] }).notNull().default('global'),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permission] })],
);
