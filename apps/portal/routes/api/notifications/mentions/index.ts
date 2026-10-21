import { defineHandler } from 'void';
import { requirePrincipal } from '../../../../src/server/guard';
import { mentionInbox, mentionsQuery } from '../../../../src/server/messaging/notices';
import { rateLimit } from '../../../../src/server/rate-limit';

/** The caller's mention notices, newest first; `?before=<id>` for the next page. */
export const GET = defineHandler.withValidator({ query: mentionsQuery })(async (c, { query }) => {
  const principal = await requirePrincipal(c);
  await rateLimit(c, 'notifications_read', 120, 60);
  c.header('Cache-Control', 'private, no-store');
  return mentionInbox(principal, query);
});
