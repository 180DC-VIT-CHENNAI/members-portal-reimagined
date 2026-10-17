import { auditLog, newsletterSubscribers } from '@schema';
import { defineHandler } from 'void';
import { db, eq, sql } from 'void/db';
import { requirePermission } from '../../../../src/server/guard';
import { idParam, notFound } from '../../../../src/server/http';
import { rateLimit } from '../../../../src/server/rate-limit';

/** Erase the subscription, not just its active flag. The audit identifies the row, never retains the address. */
export const DELETE = defineHandler(async (c) => {
  const actor = await requirePermission(c, 'newsletter.manage', null);
  await rateLimit(c, 'newsletter_admin', 60, 3600);
  const id = idParam(c);
  const [, rows] = await db.batch([
    db.insert(auditLog).select(db.select({ id: sql`NULL`.as('id'), actorPersonId: sql<string>`${actor.person.id}`.as('actor_person_id'),
      action: sql<string>`'newsletter.subscriber.erase'`.as('action'), targetType: sql<string>`'newsletter_subscriber'`.as('target_type'),
      targetId: newsletterSubscribers.id, details: sql`NULL`.as('details'), createdAt: sql<string>`datetime('now')`.as('created_at'),
    }).from(newsletterSubscribers).where(eq(newsletterSubscribers.id, id))),
    db.delete(newsletterSubscribers).where(eq(newsletterSubscribers.id, id)).returning({ id: newsletterSubscribers.id }),
  ]);
  if (!rows.length) notFound('subscriber_not_found');
  return { erased: true };
});
