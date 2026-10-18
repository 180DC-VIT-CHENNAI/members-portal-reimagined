import { defineHandler } from 'void';
import { requirePrincipal } from '../../../src/server/guard';
import { markRead, markReadInput, unreadCount } from '../../../src/server/notifications';
import { rateLimit } from '../../../src/server/rate-limit';

/** Mark the caller's own notices read: `{ ids }` or `{ upTo }`. Answers with the new unread count. */
export const POST = defineHandler.withValidator({ body: markReadInput })(async (c, { body }) => {
  const principal = await requirePrincipal(c);
  await rateLimit(c, 'notifications_write', 120, 60);
  await markRead(principal, body);
  c.header('Cache-Control', 'private, no-store');
  return unreadCount(principal);
});
