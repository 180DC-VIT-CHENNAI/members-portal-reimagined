import { NOTIFICATION_CATEGORIES, notificationPreferences } from '@schema';
import * as v from 'valibot';
import { db, eq, sql } from 'void/db';
import { validQuietHours } from '../messaging-rules.ts';
import type { Principal } from '../principal';

const quiet = v.nullable(v.pipe(v.string(), v.regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'invalid_time')));

export const preferencesInput = v.object({
  preferences: v.pipe(
    v.array(
      v.pipe(
        v.object({ category: v.picklist(NOTIFICATION_CATEGORIES), inApp: v.boolean(), emailDigest: v.boolean(), quietStart: quiet, quietEnd: quiet }),
        v.check((pref) => validQuietHours(pref.quietStart, pref.quietEnd), 'invalid_quiet_hours'),
      ),
    ),
    v.minLength(1),
    v.maxLength(NOTIFICATION_CATEGORIES.length),
    v.check((prefs) => new Set(prefs.map((pref) => pref.category)).size === prefs.length, 'duplicate_category'),
  ),
});

/** Every category for the caller, with defaults (in-app on, digest off, no quiet hours) where nothing is stored. */
export async function preferencesFor(principal: Principal) {
  const rows = await db.select().from(notificationPreferences).where(eq(notificationPreferences.personId, principal.person.id));
  const stored = new Map(rows.map((row) => [row.category, row]));
  return {
    preferences: NOTIFICATION_CATEGORIES.map((category) => {
      const row = stored.get(category);
      return {
        category,
        inApp: row?.inApp ?? true,
        emailDigest: row?.emailDigest ?? false,
        quietStart: row?.quietStart ?? null,
        quietEnd: row?.quietEnd ?? null,
      };
    }),
  };
}

export async function savePreferences(principal: Principal, input: v.InferOutput<typeof preferencesInput>) {
  for (const pref of input.preferences) {
    const values = { inApp: pref.inApp, emailDigest: pref.emailDigest, quietStart: pref.quietStart, quietEnd: pref.quietEnd };
    await db
      .insert(notificationPreferences)
      .values({ personId: principal.person.id, category: pref.category, ...values })
      .onConflictDoUpdate({ target: [notificationPreferences.personId, notificationPreferences.category], set: { ...values, updatedAt: sql`datetime('now')` } });
  }
  return preferencesFor(principal);
}
