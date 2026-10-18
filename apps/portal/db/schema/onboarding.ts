import { sql } from 'drizzle-orm';
import { primaryKey, sqliteTable, text } from 'void/schema-d1';
import { people } from './people';

/**
 * Checklist items a person confirms themselves ("I've read this"). Items the
 * portal can derive from data (a complete profile) are never stored.
 * `checklist_dismissed` hides the whole first-login checklist.
 */
export const ONBOARDING_ACK_KEYS = ['department_read', 'resources_read', 'checklist_dismissed'] as const;
export type OnboardingAckKey = (typeof ONBOARDING_ACK_KEYS)[number];

export const onboardingAcknowledgments = sqliteTable(
  'onboarding_acknowledgments',
  {
    personId: text('person_id')
      .notNull()
      .references(() => people.id),
    item: text('item', { enum: ONBOARDING_ACK_KEYS }).notNull(),
    acknowledgedAt: text('acknowledged_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [primaryKey({ columns: [t.personId, t.item] })],
);
