import { newsletters } from '@schema';
import { defineHandler } from 'void';
import { db, desc, isNotNull } from 'void/db';
import { slugOf } from '../../../src/server/newsletter/issues';
import { rateLimit } from '../../../src/server/rate-limit';

export const GET = defineHandler(async (c) => {
  await rateLimit(c, 'newsletter_public', 100, 60);
  const rows = await db.select({ id: newsletters.id, issue: newsletters.issue, title: newsletters.title, description: newsletters.description, sentAt: newsletters.sentAt }).from(newsletters).where(isNotNull(newsletters.sentAt)).orderBy(desc(newsletters.issue)).limit(50);
  return rows.map((row) => ({ ...row, slug: slugOf(row.issue) }));
});
