import { departments } from '@schema';
import { defineHandler } from 'void';
import { asc, db } from 'void/db';
import { requirePrincipal } from '../../src/server/guard';

export const GET = defineHandler(async (c) => {
  await requirePrincipal(c);
  return db.select().from(departments).orderBy(asc(departments.name));
});
