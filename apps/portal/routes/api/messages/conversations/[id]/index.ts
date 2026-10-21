import { defineHandler } from 'void';
import { requirePrincipal } from '../../../../../src/server/guard';
import { idParam } from '../../../../../src/server/http';
import { conversationFor } from '../../../../../src/server/messaging/access';
import { rateLimit } from '../../../../../src/server/rate-limit';

/** One conversation the caller can read (404 otherwise). */
export const GET = defineHandler(async (c) => {
  const principal = await requirePrincipal(c);
  await rateLimit(c, 'messages_read', 240, 60);
  const { counterpartActive, lastRead, ...conversation } = await conversationFor(principal, idParam(c));
  c.header('Cache-Control', 'private, no-store');
  return { ...conversation, lastReadMessageId: lastRead };
});
