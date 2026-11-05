import { defineHandler } from 'void';
import { requirePrincipal } from '../../../../src/server/guard';
import { markMailNoticesInput, markMailNoticesRead } from '../../../../src/server/mailboxes/notices';
import { unreadCount } from '../../../../src/server/notifications';
import { rateLimit } from '../../../../src/server/rate-limit';

/** Recipient-only read acknowledgments; return the combined task, mention and mail count. */
export const POST = defineHandler.withValidator({ body: markMailNoticesInput })(async (c, { body }) => {
  const principal = await requirePrincipal(c);
  await rateLimit(c, 'notifications_write', 120, 60);
  await markMailNoticesRead(principal, body);
  c.header('Cache-Control', 'private, no-store');
  return unreadCount(principal);
});
