import { mailSendAttempts } from '@schema';
import { defineHandler } from 'void';
import { db, eq } from 'void/db';
import { requirePrincipal } from '../../../../../src/server/guard';
import { idParam, notFound } from '../../../../../src/server/http';
import { intentFor } from '../../../../../src/server/mailboxes/intents';

export const GET = defineHandler(async (c) => {
  const intent = await intentFor(await requirePrincipal(c), idParam(c), c.req.param('intentId') ?? notFound());
  c.header('Cache-Control', 'private, no-store');
  return { intent, attempts: await db.select().from(mailSendAttempts).where(eq(mailSendAttempts.intentId, intent.id)).limit(50) };
});
