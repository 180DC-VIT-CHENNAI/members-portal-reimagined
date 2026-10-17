import { newsletterSubscribers } from '@schema';
import { defineHandler } from 'void';
import { db, desc } from 'void/db';
import { requirePermission } from '../../../../src/server/guard';

export const GET = defineHandler(async (c) => {
  await requirePermission(c, 'newsletter.manage', null);
  c.header('Cache-Control', 'private, no-store');
  return db.select({ id: newsletterSubscribers.id, email: newsletterSubscribers.email, name: newsletterSubscribers.name,
    status: newsletterSubscribers.status, confirmedAt: newsletterSubscribers.confirmedAt,
    lastUnsubscribedAt: newsletterSubscribers.lastUnsubscribedAt, createdAt: newsletterSubscribers.createdAt,
  }).from(newsletterSubscribers).orderBy(desc(newsletterSubscribers.createdAt), desc(newsletterSubscribers.id));
});
