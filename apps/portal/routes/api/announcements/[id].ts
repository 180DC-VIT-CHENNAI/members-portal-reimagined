import { announcements } from '@schema';
import { defineHandler } from 'void';
import { db, eq } from 'void/db';
import { audit } from '../../../src/server/audit';
import { requirePermission } from '../../../src/server/guard';
import { idParam, notFound } from '../../../src/server/http';

export const DELETE = defineHandler(async (c) => {
  const actor = await requirePermission(c, 'announcements.manage');
  const [removed] = await db.delete(announcements).where(eq(announcements.id, idParam(c))).returning({ id: announcements.id, title: announcements.title });
  if (!removed) notFound('announcement_not_found');
  await audit(actor.person.id, 'announcement.delete', 'announcement', removed.id, { title: removed.title });
  return null;
});
