import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'void/schema-d1';

/** Club departments (business_strategy, crm, finance, marketing, operations, tech, ...). */
export const departments = sqliteTable('departments', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

/** Academic-year terms, e.g. id "2026-27". Exactly one should be current. */
export const terms = sqliteTable('terms', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  startsOn: text('starts_on').notNull(),
  endsOn: text('ends_on').notNull(),
  isCurrent: integer('is_current', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

/**
 * Titles people hold (e.g. "Technical Lead - DevOps & Cloud"). A position says
 * nothing about access; access comes from access roles and grants.
 * departmentId null = club-wide position (e.g. Chairperson).
 */
export const positions = sqliteTable(
  'positions',
  {
    id: text('id').primaryKey(),
    departmentId: text('department_id').references(() => departments.id),
    title: text('title').notNull(),
    rank: integer('rank').notNull().default(100),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [uniqueIndex('positions_department_title').on(t.departmentId, t.title)],
);
