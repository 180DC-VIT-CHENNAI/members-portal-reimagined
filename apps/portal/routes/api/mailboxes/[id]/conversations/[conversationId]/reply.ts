import { defineHandler } from 'void';
import { requirePrincipal } from '../../../../../../src/server/guard';
import { idParam, notFound } from '../../../../../../src/server/http';
import { rateLimit } from '../../../../../../src/server/rate-limit';
import { createReply } from '../../../../../../src/server/mailboxes/inbox-actions';
import { replyInput } from '../../../../../../src/server/mailboxes/inbox-validation';

export const POST = defineHandler.withValidator({ body: replyInput })(async (c, { body }) => {
  const actor = await requirePrincipal(c);
  await rateLimit(c, 'mailbox_drafts', 60, 3600);
  return c.json(await createReply(actor, { mailboxId: idParam(c), conversationId: c.req.param('conversationId') ?? notFound(), messageId: body.messageId }), 201);
});
