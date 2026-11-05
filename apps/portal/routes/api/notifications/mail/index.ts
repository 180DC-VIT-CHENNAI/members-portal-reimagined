import { defineHandler } from 'void';
import { requirePrincipal } from '../../../../src/server/guard';
import { mailNoticeInbox, mailNoticesQuery } from '../../../../src/server/mailboxes/notices';
import { rateLimit } from '../../../../src/server/rate-limit';

/** Scoped mail notices in the shared notification inbox. */
export const GET = defineHandler.withValidator({ query: mailNoticesQuery })(async (c, { query }) => {
  const principal = await requirePrincipal(c);
  await rateLimit(c, 'notifications_read', 120, 60);
  c.header('Cache-Control', 'private, no-store');
  return mailNoticeInbox(principal, query);
});
