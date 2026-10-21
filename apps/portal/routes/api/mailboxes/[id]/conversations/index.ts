import { defineHandler } from 'void';
import { requirePrincipal } from '../../../../../src/server/guard';
import { idParam } from '../../../../../src/server/http';
import { listConversations } from '../../../../../src/server/mailboxes/inbox-read';
import { inboxQuery } from '../../../../../src/server/mailboxes/inbox-validation';
import { rateLimit } from '../../../../../src/server/rate-limit';

export const GET = defineHandler.withValidator({ query: inboxQuery })(async (c, { query }) => {
  const actor = await requirePrincipal(c);
  await rateLimit(c, 'mailbox_inbox', 120, 60);
  c.header('Cache-Control', 'private, no-store');
  return listConversations(actor, idParam(c), query);
});
