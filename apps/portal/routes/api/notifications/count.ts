import { defineHandler } from 'void';
import { requirePrincipal } from '../../../src/server/guard';
import { unreadCount } from '../../../src/server/notifications';
import { rateLimit } from '../../../src/server/rate-limit';

/** How many unread notices the caller can still see, up to 99. */
export const GET = defineHandler(async (c) => {
  const principal = await requirePrincipal(c);
  await rateLimit(c, 'notifications_count', 120, 60);
  c.header('Cache-Control', 'private, no-store');
  return unreadCount(principal);
});
