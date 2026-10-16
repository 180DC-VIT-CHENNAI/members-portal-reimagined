import { partners } from '@schema';
import { defineHandler } from 'void';
import { asc, db } from 'void/db';
import { rateLimit } from '../../../src/server/rate-limit';

/** Public: client organisations for the landing page. */
export const GET = defineHandler(async (c) => {
  await rateLimit(c, 'content_partners', 100, 60);
  return db.select().from(partners).orderBy(asc(partners.sortOrder), asc(partners.name));
});
