import { defineHandler } from 'void';
import { requirePrincipal } from '../../../../src/server/guard';
import { markMentionsInput, markMentionsRead } from '../../../../src/server/messaging/notices';
import { unreadCount } from '../../../../src/server/notifications';
import { rateLimit } from '../../../../src/server/rate-limit';

/** Mark the caller's own mention notices read: `{ ids }` or `{ upTo }`. Answers with the new unread count. */
export const POST = defineHandler.withValidator({ body: markMentionsInput })(async (c, { body }) => {
  const principal = await requirePrincipal(c);
  await rateLimit(c, 'notifications_write', 120, 60);
  await markMentionsRead(principal, body);
  c.header('Cache-Control', 'private, no-store');
  return unreadCount(principal);
});
