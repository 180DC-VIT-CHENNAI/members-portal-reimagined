import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'void/schema-d1';
import { departments, positions, terms } from './org';
import { people, PERSON_STATUSES, tenures } from './people';

/**
 * Secondary department memberships. `people.department_id` stays the primary
 * department and the only one department-scoped role permissions follow; a
 * membership here lists the person under another department (directory filter,
 * person page) without granting anything there.
 */
export const departmentMemberships = sqliteTable(
  'department_memberships',
  {
    id: text('id').primaryKey(),
    personId: text('person_id')
      .notNull()
      .references(() => people.id),
    departmentId: text('department_id')
      .notNull()
      .references(() => departments.id),
    /** Their role in that department, e.g. "Design support". */
    note: text('note'),
    /** YYYY-MM-DD. */
    validFrom: text('valid_from').notNull(),
    /** YYYY-MM-DD, inclusive; null while open. */
    validUntil: text('valid_until'),
    createdBy: text('created_by'),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [index('department_memberships_person').on(t.personId), index('department_memberships_department').on(t.departmentId, t.validUntil)],
);

/** Every lifecycle transition: who moved whom, why and from when. Append-only. */
export const personStatusHistory = sqliteTable(
  'person_status_history',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    personId: text('person_id')
      .notNull()
      .references(() => people.id),
    /** Null for the record's creation (the invitation). */
    fromStatus: text('from_status', { enum: PERSON_STATUSES }),
    toStatus: text('to_status', { enum: PERSON_STATUSES }).notNull(),
    reason: text('reason'),
    /** YYYY-MM-DD the change counts from. */
    effectiveOn: text('effective_on').notNull(),
    /** Null when the system made the change (first sign-in). */
    actorPersonId: text('actor_person_id'),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [index('person_status_history_person').on(t.personId, t.id)],
);

export const PROMOTION_STATUSES = ['pending', 'approved', 'rejected', 'withdrawn'] as const;
export type PromotionStatus = (typeof PROMOTION_STATUSES)[number];

/**
 * A proposed position for a person in a term. Approval by a second person
 * creates the tenure; it never changes access roles or grants.
 */
export const promotionProposals = sqliteTable(
  'promotion_proposals',
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
    /** YYYY-MM-DD the tenure starts when approved. */
    startsOn: text('starts_on').notNull(),
    rationale: text('rationale').notNull(),
    /** Optional Letter Studio document issued for this promotion. */
    letterDocumentId: text('letter_document_id'),
    status: text('status', { enum: PROMOTION_STATUSES }).notNull().default('pending'),
    proposedBy: text('proposed_by')
      .notNull()
      .references(() => people.id),
    decidedBy: text('decided_by').references(() => people.id),
    decidedAt: text('decided_at'),
    decisionNote: text('decision_note'),
    tenureId: text('tenure_id').references(() => tenures.id),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [index('promotion_proposals_person').on(t.personId, t.createdAt), index('promotion_proposals_status').on(t.status, t.createdAt)],
);

export const ACCESS_REVIEW_STATUSES = ['open', 'reviewed'] as const;

/** One immutable decision per proposal also arbitrates concurrent approve/reject/withdraw requests. */
export const promotionDecisions = sqliteTable('promotion_decisions', {
  proposalId: text('proposal_id').primaryKey().references(() => promotionProposals.id),
  actorPersonId: text('actor_person_id').notNull().references(() => people.id),
  action: text('action', { enum: ['approve', 'reject', 'withdraw'] }).notNull(),
  note: text('note'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

/**
 * "Look at this person's access" tasks raised by title changes. Raising one
 * changes nothing: access stays exactly as it was until someone with
 * people.grants edits it.
 */
export const accessReviews = sqliteTable(
  'access_reviews',
  {
    id: text('id').primaryKey(),
    personId: text('person_id')
      .notNull()
      .references(() => people.id),
    /** What raised it, e.g. "promotion". */
    sourceType: text('source_type').notNull(),
    sourceId: text('source_id').notNull(),
    note: text('note').notNull(),
    status: text('status', { enum: ACCESS_REVIEW_STATUSES }).notNull().default('open'),
    reviewedBy: text('reviewed_by').references(() => people.id),
    reviewedAt: text('reviewed_at'),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [uniqueIndex('access_reviews_source').on(t.sourceType, t.sourceId), index('access_reviews_person').on(t.personId, t.status)],
);

export type HandoverChecklistItem = { item: string; done: boolean };

/** One offboarding run that changed something, with its handover checklist and summary. */
export const offboardingRecords = sqliteTable(
  'offboarding_records',
  {
    id: text('id').primaryKey(),
    personId: text('person_id')
      .notNull()
      .references(() => people.id),
    toStatus: text('to_status', { enum: PERSON_STATUSES }).notNull(),
    successorId: text('successor_id').references(() => people.id),
    reason: text('reason').notNull(),
    effectiveOn: text('effective_on').notNull(),
    checklist: text('checklist', { mode: 'json' }).$type<HandoverChecklistItem[]>().notNull(),
    summary: text('summary', { mode: 'json' }).$type<Record<string, number>>().notNull(),
    actorPersonId: text('actor_person_id').notNull(),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [index('offboarding_records_person').on(t.personId, t.createdAt)],
);

/** Board transition checklist for the incoming board of a term. */
export const boardHandoverItems = sqliteTable(
  'board_handover_items',
  {
    id: text('id').primaryKey(),
    termId: text('term_id')
      .notNull()
      .references(() => terms.id),
    title: text('title').notNull(),
    ownerPersonId: text('owner_person_id').references(() => people.id),
    done: integer('done', { mode: 'boolean' }).notNull().default(false),
    doneAt: text('done_at'),
    doneBy: text('done_by'),
    createdBy: text('created_by'),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [index('board_handover_items_term').on(t.termId, t.createdAt)],
);
