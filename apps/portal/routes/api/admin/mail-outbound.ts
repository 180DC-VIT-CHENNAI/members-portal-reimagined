import { mailOutboundSwitch } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db, eq } from 'void/db';
import { requirePermission } from '../../../src/server/guard';
import { audit } from '../../../src/server/audit';

export const GET = defineHandler(async (c) => {
  await requirePermission(c, 'mailboxes.admin', null);
  const [row] = await db.select().from(mailOutboundSwitch).where(eq(mailOutboundSwitch.id, 1));
  return { paused: row?.paused ?? false };
});
export const PUT = defineHandler.withValidator({ body: v.strictObject({ paused: v.boolean() }) })(async (c, { body }) => {
  const actor = await requirePermission(c, 'mailboxes.admin', null);
  const values = { id: 1, paused: body.paused, updatedBy: actor.person.id, updatedAt: new Date().toISOString() };
  await db.insert(mailOutboundSwitch).values(values).onConflictDoUpdate({ target: mailOutboundSwitch.id, set: values });
  await audit(actor.person.id, 'mail.outbound.pause', 'settings', 'mail', { paused: body.paused });
  return body;
});
