import { people } from '@schema';
import { defineHandler } from 'void';
import { asc, db, inArray } from 'void/db';
import { requirePrincipal } from '../../../src/server/guard';
import { forbidden } from '../../../src/server/http';
import { can } from '../../../src/server/permissions';

export const GET = defineHandler(async (c) => {
  const actor = await requirePrincipal(c);
  if (!can(actor.permissions, 'letters.manage')) forbidden();
  c.header('Cache-Control', 'private, no-store');
  const rows = await db.select({ id: people.id, fullName: people.fullName, email: people.email, regNo: people.regNo, departmentId: people.departmentId }).from(people).where(inArray(people.status, ['active', 'on_leave'])).orderBy(asc(people.fullName));
  return rows.filter((person) => can(actor.permissions, 'letters.manage', person.departmentId));
});
