import { devOutbox } from '@schema';
import { HTTPException } from 'hono/http-exception';
import { defineHandler } from 'void';
import { asc, db } from 'void/db';
import { emailTestMode } from '../../../src/server/email/send';

function requireCapture() {
  if (!emailTestMode()) throw new HTTPException(404);
}

export const GET = defineHandler(async () => {
  requireCapture();
  return { messages: await db.select().from(devOutbox).orderBy(asc(devOutbox.id)) };
});

export const DELETE = defineHandler(async () => {
  requireCapture();
  await db.delete(devOutbox);
  return { success: true };
});
