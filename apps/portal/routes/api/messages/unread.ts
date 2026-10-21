import { defineHandler } from 'void';
import { requirePrincipal } from '../../../src/server/guard';
import { unreadMessages } from '../../../src/server/messaging/messages';
import { rateLimit } from '../../../src/server/rate-limit';

/** Unread messages across readable, unmuted conversations, up to 99. */
export const GET = defineHandler(async (c) => {
  const principal = await requirePrincipal(c);
  await rateLimit(c, 'messages_read', 240, 60);
  c.header('Cache-Control', 'private, no-store');
  return unreadMessages(principal);
});
