import { defineHandler } from 'void';
import { requirePrincipal } from '../../../../../../src/server/guard';
import { idParam, notFound } from '../../../../../../src/server/http';
import { rateLimit } from '../../../../../../src/server/rate-limit';
import { addConversationNote } from '../../../../../../src/server/mailboxes/inbox-actions';
import { noteInput } from '../../../../../../src/server/mailboxes/inbox-validation';

export const POST = defineHandler.withValidator({ body: noteInput })(async (c, { body }) => {
  const actor = await requirePrincipal(c);
  await rateLimit(c, 'mailbox_conversation_actions', 120, 3600);
  return c.json(await addConversationNote(actor, { mailboxId: idParam(c), conversationId: c.req.param('conversationId') ?? notFound(), body: body.body }), 201);
});
