import { newsletterSubscribers } from '@schema';
import { defineHandler } from 'void';
import { db, eq, sql } from 'void/db';
import { rateLimit } from '../../../../src/server/rate-limit';

export const GET = defineHandler(async (c) => {
  await rateLimit(c, 'newsletter_public', 100, 60);
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(newsletterSubscribers).where(eq(newsletterSubscribers.status, 'active'));
  return { count: row?.count ?? 0 };
});
