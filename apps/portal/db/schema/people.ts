import { sql } from 'drizzle-orm';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'void/schema-d1';
import { accessRoles } from './access';
import { departments, positions, terms } from './org';

export const PERSON_STATUSES = ['invited', 'active', 'on_leave', 'alumni', 'removed'] as const;
export type PersonStatus = (typeof PERSON_STATUSES)[number];

/**
 * Everyone the club knows about. Never deleted: leaving the club changes status.
 * Only "active" and "on_leave" people can sign in; "invited" people are activated
 * by their first Google sign-in with this verified email.
 */
export const people = sqliteTable(
  'people',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    authUserId: text('auth_user_id'),
    fullName: text('full_name').notNull(),
    status: text('status', { enum: PERSON_STATUSES }).notNull().default('invited'),
    departmentId: text('department_id').references(() => departments.id),
    accessRoleId: text('access_role_id')
      .notNull()
      .references(() => accessRoles.id),
    // Rich profile (self-editable)
    phone: text('phone'),
    regNo: text('reg_no'),
    year: integer('year'),
    branch: text('branch'),
    linkedinUrl: text('linkedin_url'),
    githubUrl: text('github_url'),
    photoKey: text('photo_key'),
    bio: text('bio'),
    skills: text('skills', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    // Lifecycle bookkeeping
    invitedBy: text('invited_by'),
    activatedAt: text('activated_at'),
    statusChangedAt: text('status_changed_at').notNull().default(sql`(datetime('now'))`),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [
    uniqueIndex('people_email').on(t.email),
    uniqueIndex('people_auth_user').on(t.authUserId),
    index('people_status').on(t.status),
    index('people_department').on(t.departmentId),
  ],
);

/** Extra permissions for one person, optionally limited to one department. */
export const personGrants = sqliteTable(
  'person_grants',
  {
    id: text('id').primaryKey(),
    personId: text('person_id')
      .notNull()
      .references(() => people.id),
    permission: text('permission').notNull(),
    departmentId: text('department_id').references(() => departments.id),
    grantedBy: text('granted_by'),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [uniqueIndex('person_grants_unique').on(t.personId, t.permission, t.departmentId)],
);

/** Tenure history: who held which position in which term. */
export const tenures = sqliteTable(
  'tenures',
  {
    id: text('id').primaryKey(),
    personId: text('person_id')
      .notNull()
      .references(() => people.id),
    positionId: text('position_id')
      .notNull()
      .references(() => positions.id),
    termId: text('term_id')
      .notNull()
      .references(() => terms.id),
    startedOn: text('started_on').notNull(),
    endedOn: text('ended_on'),
    /** Who this person reports to while holding the position; drives the org chart. */
    reportsToPersonId: text('reports_to_person_id').references((): AnySQLiteColumn => people.id),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [
    index('tenures_person').on(t.personId),
    index('tenures_term').on(t.termId),
    uniqueIndex('tenures_unique').on(t.personId, t.positionId, t.termId),
  ],
);

/** Append-only record of administrative actions. */
export const auditLog = sqliteTable(
  'audit_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    actorPersonId: text('actor_person_id'),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id'),
    details: text('details', { mode: 'json' }).$type<Record<string, unknown>>(),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [index('audit_log_target').on(t.targetType, t.targetId)],
);
