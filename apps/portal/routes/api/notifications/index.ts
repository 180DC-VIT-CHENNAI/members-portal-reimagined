import { defineHandler } from 'void';
import { requirePrincipal } from '../../../src/server/guard';
import { inbox, inboxQuery } from '../../../src/server/notifications';
import { rateLimit } from '../../../src/server/rate-limit';

/** The caller's notices, newest first; `?unread=1` for unread only, `?before=<id>` for the next page. */
export const GET = defineHandler.withValidator({ query: inboxQuery })(async (c, { query }) => {
  const principal = await requirePrincipal(c);
  await rateLimit(c, 'notifications_read', 120, 60);
  c.header('Cache-Control', 'private, no-store');
  return inbox(principal, query);
});
