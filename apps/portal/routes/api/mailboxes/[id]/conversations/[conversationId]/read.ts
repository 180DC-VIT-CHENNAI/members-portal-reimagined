import { defineHandler } from 'void';
import { requirePrincipal } from '../../../../../../src/server/guard';
import { idParam, notFound } from '../../../../../../src/server/http';
import { rateLimit } from '../../../../../../src/server/rate-limit';
import { markConversationRead } from '../../../../../../src/server/mailboxes/inbox-actions';

export const POST = defineHandler(async (c) => {
  const actor = await requirePrincipal(c);
  await rateLimit(c, 'mailbox_conversation_actions', 120, 3600);
  return markConversationRead(actor, idParam(c), c.req.param('conversationId') ?? notFound());
});
