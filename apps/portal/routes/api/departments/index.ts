import { departments } from '@schema';
import { defineHandler } from 'void';
import { asc, db } from 'void/db';
import { rateLimit } from '../../../src/server/rate-limit';

/** Public: the department catalogue (the old Worker's public list, plus `active`). */
export const GET = defineHandler(async (c) => {
  await rateLimit(c, 'public_departments', 100, 60);
  return db
    .select({ id: departments.id, name: departments.name, description: departments.description, active: departments.active })
    .from(departments)
    .orderBy(asc(departments.name));
});
