import { sql } from 'drizzle-orm';
import { integer, primaryKey, sqliteTable, text } from 'void/schema-d1';
import { people } from './people';

/**
 * Checklist items a person confirms themselves ("I've read this"). Items the
 * portal can derive from data (a complete profile) are never stored.
 * `checklist_dismissed` hides the whole first-login checklist.
 */
export const ONBOARDING_ACK_KEYS = ['department_read', 'resources_read', 'checklist_dismissed'] as const;
export type OnboardingAckKey = (typeof ONBOARDING_ACK_KEYS)[number];
/** A fixed item, or `policy:<policy id>` for an admin-configured policy acknowledgment. */
export type OnboardingAckItem = OnboardingAckKey | `policy:${string}`;

/** Policies every member acknowledges from the first-login checklist, configured by admins. */
export const onboardingPolicies = sqliteTable('onboarding_policies', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  /** An https:// document or an in-portal path. */
  href: text('href'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdBy: text('created_by'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export const onboardingAcknowledgments = sqliteTable(
  'onboarding_acknowledgments',
  {
    personId: text('person_id')
      .notNull()
      .references(() => people.id),
    item: text('item').$type<OnboardingAckItem>().notNull(),
    acknowledgedAt: text('acknowledged_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [primaryKey({ columns: [t.personId, t.item] })],
);
