import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'void/schema-d1';
import { departments } from './org';
import { people } from './people';

export const TEAM_STATUSES = ['active', 'eliminated', 'winner'] as const;
export type TeamStatus = (typeof TEAM_STATUSES)[number];

/**
 * Team instances (slice 6): a staffing and progression board for one event,
 * competition or programme. Departments run it; its teams, optionally grouped
 * (for example by client company), are staffed with members and outside
 * people and move through named levels.
 */
export const teamInstances = sqliteTable('team_instances', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  /** What a group is called in this instance, e.g. "Company" or "Client". */
  groupLabel: text('group_label').notNull().default('Company'),
  createdBy: text('created_by'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

/** The departments running an instance (one or more). */
export const instanceDepartments = sqliteTable(
  'instance_departments',
  {
    instanceId: text('instance_id')
      .notNull()
      .references(() => teamInstances.id, { onDelete: 'cascade' }),
    departmentId: text('department_id')
      .notNull()
      .references(() => departments.id),
  },
  (t) => [primaryKey({ columns: [t.instanceId, t.departmentId] }), index('instance_departments_department').on(t.departmentId)],
);

/** The progression ladder: positions 1..n, each named. */
export const instanceLevels = sqliteTable(
  'instance_levels',
  {
    instanceId: text('instance_id')
      .notNull()
      .references(() => teamInstances.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    name: text('name').notNull(),
  },
  (t) => [primaryKey({ columns: [t.instanceId, t.position] })],
);

/** Groups of teams, named by the instance's group label. */
export const instanceGroups = sqliteTable(
  'instance_groups',
  {
    id: text('id').primaryKey(),
    instanceId: text('instance_id')
      .notNull()
      .references(() => teamInstances.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    organization: text('organization'),
    description: text('description'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdBy: text('created_by'),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [index('instance_groups_instance').on(t.instanceId, t.sortOrder)],
);

/** A team: its size limits count members and outside people together. */
export const instanceTeams = sqliteTable(
  'instance_teams',
  {
    id: text('id').primaryKey(),
    instanceId: text('instance_id')
      .notNull()
      .references(() => teamInstances.id, { onDelete: 'cascade' }),
    groupId: text('group_id').references(() => instanceGroups.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    description: text('description'),
    minMembers: integer('min_members'),
    maxMembers: integer('max_members'),
    sortOrder: integer('sort_order').notNull().default(0),
    currentLevel: integer('current_level').notNull().default(1),
    status: text('status', { enum: TEAM_STATUSES }).notNull().default('active'),
    createdBy: text('created_by'),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [index('instance_teams_instance').on(t.instanceId, t.sortOrder)],
);

/** Members placed on a team. One person may be on several teams of an instance. */
export const instanceTeamMembers = sqliteTable(
  'instance_team_members',
  {
    teamId: text('team_id')
      .notNull()
      .references(() => instanceTeams.id, { onDelete: 'cascade' }),
    personId: text('person_id')
      .notNull()
      .references(() => people.id),
    addedBy: text('added_by'),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.personId] }), index('instance_team_members_person').on(t.personId)],
);

/** People from outside the club (e.g. client staff), local to one instance. */
export const instanceExternals = sqliteTable(
  'instance_externals',
  {
    id: text('id').primaryKey(),
    instanceId: text('instance_id')
      .notNull()
      .references(() => teamInstances.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Lower-cased; unique within its instance when set. */
    email: text('email'),
    organization: text('organization'),
    createdBy: text('created_by'),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [uniqueIndex('instance_externals_email').on(t.instanceId, t.email)],
);

/** Outside people placed on a team. */
export const instanceTeamExternals = sqliteTable(
  'instance_team_externals',
  {
    teamId: text('team_id')
      .notNull()
      .references(() => instanceTeams.id, { onDelete: 'cascade' }),
    externalId: text('external_id')
      .notNull()
      .references(() => instanceExternals.id, { onDelete: 'cascade' }),
    addedBy: text('added_by'),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.externalId] }), index('instance_team_externals_external').on(t.externalId)],
);
